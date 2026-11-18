const { app, BrowserWindow, ipcMain, session, shell, dialog, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// Listener limitini artır (webview çox olduqda warning verməsin)
require('events').EventEmitter.defaultMaxListeners = 30;

// ============================================================
// ADBLOCKER (Ghostery) — YouTube istisna edilib
// ============================================================
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

let fetchFn = global.fetch;
if (!fetchFn) {
    try { fetchFn = require('cross-fetch'); } catch { fetchFn = null; }
}

let adblocker = null;
let adblockerReady = false;

// ✅ Hansı sessiyaların artıq aktiv olduğunu izləyirik
const enabledSessions = new Set();

// YouTube domenlərini Ghostery-dən kənarda saxla
const YOUTUBE_EXCEPTION_FILTERS = [
    '@@||youtube.com^$document',
    '@@||www.youtube.com^$document',
    '@@||m.youtube.com^$document',
    '@@||youtu.be^$document',
    '@@||youtube-nocookie.com^$document',
    '@@||googlevideo.com^$document',
    '@@||ytimg.com^$document'
];

function getSessionKey(sess) {
    if (!sess) return null;
    try {
        return sess.storagePath || sess.partition || 'default';
    } catch {
        return 'default';
    }
}

async function initAdblocker(sess) {
    if (!sess) return;

    const key = getSessionKey(sess);

    if (enabledSessions.has(key)) {
        return;
    }

    try {
        if (!adblocker) {
            adblocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetchFn);
            try {
                adblocker.update({ newNetworkFilters: YOUTUBE_EXCEPTION_FILTERS });
                console.log('[Adblock] Ghostery loaded with YouTube exceptions');
            } catch (e) {
                console.warn('[Adblock] update() failed, using default filters:', e.message);
            }
        }

        adblocker.enableBlockingInSession(sess);
        enabledSessions.add(key);
        adblockerReady = true;
        console.log('[Adblock] Enabled for session:', key);
    } catch (e) {
        if (e.message && e.message.includes('second handler')) {
            console.log('[Adblock] Handler already registered, marking session as active:', key);
            enabledSessions.add(key);
            adblockerReady = true;
        } else {
            console.error('[Adblock] init failed:', e.message);
        }
    }
}

// ============================================================
// APP SETUP
// ============================================================
app.commandLine.appendSwitch('lang', 'en-US');
app.commandLine.appendSwitch('accept-lang', 'en-US,en');

if (process.platform === 'win32') {
    app.setAppUserModelId('com.snet.browser');
}

let mainWindow;

const userData = app.getPath('userData');
const settingsPath = path.join(userData, 'settings.json');
const historyPath = path.join(userData, 'history.json');
const extensionsPath = path.join(userData, 'extensions.json');
const shortcutsPath = path.join(userData, 'shortcuts.json');
const sidebarPath = path.join(userData, 'sidebar.json');
const installedExtPath = path.join(userData, 'installed-extensions.json');

function loadJSON(p, fallback) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function saveJSON(p, data) {
    try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch {}
}

const DEFAULT_SETTINGS = {
    homePage: 'snet://newtab',
    searchEngine: 'google',
    darkMode: true,
    themeColor: '#7c5cff',
    accentColor: '#00d4ff',
    brightness: 100,
    backgroundType: 'none',
    backgroundImage: null,
    backgroundVideo: null,
    backgroundMusic: null,
    musicLoop: true,
    downloadPath: null,
    showDownloadAlert: true,
    language: 'en-US',
    adblockEnabled: true,
    youtubeSkipEnabled: true
};

const DEFAULT_EXTENSIONS = [
    { id: 'adblock', name: 'AdBlock Plus', desc: 'Blocks ads and popups', enabled: false, icon: '🛡️', builtin: true },
    { id: 'darkreader', name: 'Dark Reader', desc: 'Dark mode for every website', enabled: false, icon: '🌙', builtin: true },
    { id: 'pdfviewer', name: 'PDF Viewer', desc: 'Built-in PDF reader', enabled: true, icon: '📄', builtin: true },
    { id: 'translate', name: 'Google Translate', desc: 'Translate pages instantly', enabled: true, icon: '🌐', builtin: true },
    { id: 'grammarly', name: 'Grammarly', desc: 'Grammar and spelling checker', enabled: false, icon: '✍️', builtin: true },
    { id: 'lastpass', name: 'LastPass', desc: 'Password manager', enabled: false, icon: '🔐', builtin: true },
    { id: 'bitwarden', name: 'Bitwarden', desc: 'Open-source password manager', enabled: false, icon: '🔒', builtin: true },
    { id: 'jsonviewer', name: 'JSON Viewer', desc: 'Format JSON in browser', enabled: false, icon: '{}', builtin: true },
    { id: 'youtube-skip', name: 'YouTube Ad Skip', desc: 'Auto-clicks Skip Ad button (does not touch main video)', enabled: true, icon: '⏭️', builtin: true },
];

// ============================================================
// WINDOW CREATION
// ============================================================
function createWindow(isIncognito = false) {
    const partitionName = isIncognito ? 'incognito-' + Date.now() : undefined;
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0f0f14',
        icon: path.join(__dirname, 'icon.png'),
        title: isIncognito ? 'sNET — Incognito' : 'sNET',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            webSecurity: false,
            partition: partitionName
        }
    });

    const sess = partitionName
        ? session.fromPartition(partitionName)
        : session.defaultSession;

    initAdblocker(sess);

    const ytSkipPath = path.join(__dirname, 'youtube-skip.js');
    if (fs.existsSync(ytSkipPath)) {
        try {
            sess.registerPreloadScript({ type: 'frame', filePath: ytSkipPath });
        } catch (e) {
            if (!e.message.includes('already')) {
                console.warn('[Adblock] preload register failed:', e.message);
            }
        }
    }

    win.loadFile('index.html', { query: { incognito: isIncognito ? '1' : '0' } });
    return win;
}

// ============================================================
// APP READY
// ============================================================
app.whenReady().then(async () => {
    mainWindow = createWindow(false);

    session.defaultSession.on('will-download', (event, item) => {
        const s = loadJSON(settingsPath, DEFAULT_SETTINGS);
        const baseDir = s.downloadPath || app.getPath('downloads');
        try { if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true }); } catch {}
        const filename = item.getFilename();
        const savePath = path.join(baseDir, filename);
        item.setSavePath(savePath);

        const downloadInfo = {
            filename, path: savePath, totalBytes: item.getTotalBytes(),
            receivedBytes: 0, state: 'progressing', startTime: Date.now()
        };

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-started', downloadInfo);
        }
        item.on('updated', (e, state) => {
            downloadInfo.receivedBytes = item.getReceivedBytes();
            downloadInfo.state = state;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-updated', downloadInfo);
            }
        });
        item.once('done', (e, state) => {
            downloadInfo.state = state;
            downloadInfo.receivedBytes = item.getReceivedBytes();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-done', downloadInfo);
            }
        });
    });

    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            const metrics = app.getAppMetrics();
            let totalMemoryMB = 0, totalCpu = 0;
            metrics.forEach(m => {
                totalMemoryMB += (m.memory.workingSetSize / 1024);
                totalCpu += m.cpu.percentCPUUsage;
            });
            mainWindow.webContents.send('resource-update', {
                ram: Math.round(totalMemoryMB), cpu: Math.round(totalCpu)
            });
        } catch (e) {}
    }, 2000);

    // ============================================================
    // RIGHT CLICK CONTEXT MENU
    // ============================================================
    ipcMain.on('show-context-menu', (event, params) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;

        const { linkURL, srcURL, selectionText, pageURL, isEditable, editFlags } = params || {};
        const template = [];

        if (linkURL) {
            template.push(
                {
                    label: 'Open link in new tab',
                    click: () => win.webContents.send('context-menu-command', { cmd: 'open-link-new-tab', url: linkURL })
                },
                {
                    label: 'Open link in sidebar',
                    click: () => win.webContents.send('context-menu-command', { cmd: 'open-link-sidebar', url: linkURL })
                },
                {
                    label: 'Copy link address',
                    click: () => clipboard.writeText(linkURL)
                },
                { type: 'separator' }
            );
        }

        if (srcURL && !linkURL) {
            template.push(
                {
                    label: '🖼 Search image with Google Lens',
                    click: () => win.webContents.send('context-menu-command', { cmd: 'lens', imageUrl: srcURL })
                },
                {
                    label: 'Save image as...',
                    click: () => win.webContents.downloadURL(srcURL)
                },
                {
                    label: 'Copy image address',
                    click: () => clipboard.writeText(srcURL)
                },
                { type: 'separator' }
            );
        }

        if (selectionText && selectionText.trim()) {
            const text = selectionText.trim();
            const preview = text.length > 30 ? text.slice(0, 30) + '…' : text;
            template.push(
                {
                    label: `🤖 Search with AI: "${preview}"`,
                    click: () => win.webContents.send('context-menu-command', { cmd: 'ai-search', text })
                },
                {
                    label: '🔍 Search with Google',
                    click: () => win.webContents.send('context-menu-command', { cmd: 'google-search', text })
                },
                {
                    label: 'Copy',
                    role: 'copy'
                },
                { type: 'separator' }
            );
        }

        if (isEditable) {
            template.push(
                { label: 'Cut', role: 'cut', enabled: !!(editFlags && editFlags.canCut) },
                { label: 'Copy', role: 'copy', enabled: !!(editFlags && editFlags.canCopy) },
                { label: 'Paste', role: 'paste', enabled: !!(editFlags && editFlags.canPaste) },
                { label: 'Select all', role: 'selectAll' },
                { type: 'separator' }
            );
        }

        template.push(
            { label: '⬅ Back', click: () => win.webContents.send('context-menu-command', { cmd: 'back' }) },
            { label: '➡ Forward', click: () => win.webContents.send('context-menu-command', { cmd: 'forward' }) },
            { label: '⟳ Reload', click: () => win.webContents.send('context-menu-command', { cmd: 'reload' }) },
            { type: 'separator' },
            {
                label: '📄 View page source',
                accelerator: 'Ctrl+U',
                click: () => win.webContents.send('context-menu-command', { cmd: 'view-source', url: pageURL })
            },
            {
                label: '🔧 Inspect',
                accelerator: 'Ctrl+Shift+I',
                click: () => win.webContents.send('context-menu-command', { cmd: 'inspect', url: pageURL })
            }
        );

        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: win });
    });

    // ============================================================
    // PAGE SOURCE WINDOW
    // ============================================================
    ipcMain.on('open-page-source', (event, url) => {
        if (!url || url === 'about:blank') return;
        const srcWin = new BrowserWindow({
            width: 1000,
            height: 800,
            title: 'Page Source — ' + url,
            backgroundColor: '#1e1e1e',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: false
            }
        });

        const safeUrl = String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Source</title>
        <style>
            body { background:#1e1e1e; color:#d4d4d4; font-family: 'Consolas','Monaco',monospace; padding:16px; white-space:pre-wrap; word-break:break-word; font-size:13px; line-height:1.5; margin:0; }
            .header { position:sticky; top:0; background:#252526; padding:10px 14px; margin:-16px -16px 12px; border-bottom:1px solid #333; font-size:12px; color:#888; }
        </style>
        </head><body>
        <div class="header">📄 Source of: ${safeUrl.replace(/</g, '&lt;')}</div>
        <div id="out">Loading source...</div>
        <script>
            fetch('${safeUrl}').then(r => r.text()).then(t => {
                const out = document.getElementById('out');
                out.textContent = t;
            }).catch(e => {
                document.getElementById('out').textContent = 'Error: ' + e.message;
            });
        <\/script>
        </body></html>`;

        srcWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    });

    // ============================================================
    // DEVTOOLS (renderer webview-ə yönləndiririk)
    // ============================================================
    ipcMain.on('open-devtools', (event, url) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        win.webContents.send('context-menu-command', { cmd: 'open-devtools-now', url });
    });

    // ============================================================
    // GOOGLE LENS / AI SEARCH
    // ============================================================
    ipcMain.on('search-with-lens', (event, imageUrl) => {
        if (!imageUrl) return;
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        win.webContents.send('context-menu-command', {
            cmd: 'open-url-new-tab',
            url: 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(imageUrl)
        });
    });

    ipcMain.on('search-with-ai', (event, text) => {
        if (!text) return;
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        const prompt = 'Explain or answer about: ' + text;
        win.webContents.send('context-menu-command', {
            cmd: 'open-url-new-tab',
            url: 'https://www.google.com/search?q=' + encodeURIComponent(text) + '&udm=50'
        });
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(false);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// WINDOW CONTROLS
// ============================================================
ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('window-maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('open-new-window', (e, { incognito }) => { createWindow(!!incognito); });

// ============================================================
// SETTINGS
// ============================================================
ipcMain.handle('get-settings', () => ({ ...DEFAULT_SETTINGS, ...loadJSON(settingsPath, {}) }));
ipcMain.handle('save-settings', (e, settings) => { saveJSON(settingsPath, settings); return true; });

// ============================================================
// ADBLOCK CONTROL
// ============================================================
ipcMain.handle('set-adblock-enabled', async (e, enabled) => {
    const s = { ...DEFAULT_SETTINGS, ...loadJSON(settingsPath, {}) };
    s.adblockEnabled = !!enabled;
    saveJSON(settingsPath, s);

    if (!adblocker) return { success: false, error: 'adblocker not initialized' };

    const sessions = [
        session.defaultSession,
        ...BrowserWindow.getAllWindows().map(w => w.webContents.session)
    ];
    const seen = new Set();
    for (const sess of sessions) {
        if (!sess || seen.has(sess)) continue;
        seen.add(sess);
        const key = getSessionKey(sess);
        try {
            if (enabled) {
                if (!enabledSessions.has(key)) {
                    adblocker.enableBlockingInSession(sess);
                    enabledSessions.add(key);
                }
            } else {
                adblocker.disableBlockingInSession(sess);
                enabledSessions.delete(key);
            }
        } catch (err) {
            if (!err.message.includes('second handler') && !err.message.includes('No handler')) {
                console.warn('[Adblock] toggle failed:', err.message);
            }
        }
    }
    return { success: true, enabled: !!enabled };
});

ipcMain.handle('get-adblock-status', () => {
    const s = { ...DEFAULT_SETTINGS, ...loadJSON(settingsPath, {}) };
    return {
        enabled: !!s.adblockEnabled,
        ready: adblockerReady,
        youtubeSkipEnabled: !!s.youtubeSkipEnabled
    };
});

ipcMain.handle('set-youtube-skip-enabled', (e, enabled) => {
    const s = { ...DEFAULT_SETTINGS, ...loadJSON(settingsPath, {}) };
    s.youtubeSkipEnabled = !!enabled;
    saveJSON(settingsPath, s);
    return { success: true, enabled: !!enabled };
});

// ============================================================
// HISTORY
// ============================================================
ipcMain.handle('get-history', () => loadJSON(historyPath, []));
ipcMain.handle('add-history', (e, entry) => {
    const history = loadJSON(historyPath, []);
    history.unshift({ ...entry, time: Date.now() });
    saveJSON(historyPath, history.slice(0, 1000));
    return true;
});
ipcMain.handle('clear-history', () => { saveJSON(historyPath, []); return true; });
ipcMain.handle('remove-history-item', (e, url) => {
    let history = loadJSON(historyPath, []);
    history = history.filter(h => h.url !== url);
    saveJSON(historyPath, history);
    return true;
});

// ============================================================
// EXTENSIONS
// ============================================================
ipcMain.handle('get-extensions', () => {
    const saved = loadJSON(extensionsPath, null);
    if (!saved) { saveJSON(extensionsPath, DEFAULT_EXTENSIONS); return DEFAULT_EXTENSIONS; }
    const merged = DEFAULT_EXTENSIONS.map(def => {
        const existing = saved.find(s => s.id === def.id);
        return existing ? { ...def, enabled: existing.enabled } : def;
    });
    saveJSON(extensionsPath, merged);
    return merged;
});

ipcMain.handle('toggle-extension', (e, { id, enabled }) => {
    const extensions = loadJSON(extensionsPath, DEFAULT_EXTENSIONS);
    const ext = extensions.find(x => x.id === id);
    if (ext) { ext.enabled = enabled; saveJSON(extensionsPath, extensions); }

    if (id === 'adblock') {
        const s = { ...DEFAULT_SETTINGS, ...loadJSON(settingsPath, {}) };
        s.adblockEnabled = !!enabled;
        saveJSON(settingsPath, s);
        if (adblocker) {
            const sessions = [
                session.defaultSession,
                ...BrowserWindow.getAllWindows().map(w => w.webContents.session)
            ];
            const seen = new Set();
            for (const sess of sessions) {
                if (!sess || seen.has(sess)) continue;
                seen.add(sess);
                const key = getSessionKey(sess);
                try {
                    if (enabled) {
                        if (!enabledSessions.has(key)) {
                            adblocker.enableBlockingInSession(sess);
                            enabledSessions.add(key);
                        }
                    } else {
                        adblocker.disableBlockingInSession(sess);
                        enabledSessions.delete(key);
                    }
                } catch {}
            }
        }
    }
    if (id === 'youtube-skip') {
        const s = { ...DEFAULT_SETTINGS, ...loadJSON(settingsPath, {}) };
        s.youtubeSkipEnabled = !!enabled;
        saveJSON(settingsPath, s);
    }
    return true;
});

ipcMain.handle('install-chrome-extension', async (e, extInfo) => {
    const installed = loadJSON(installedExtPath, []);
    const newExt = {
        id: extInfo.id || 'chrome-ext-' + Date.now(),
        name: extInfo.name || 'Unknown Extension',
        desc: extInfo.desc || 'Installed from Chrome Web Store',
        icon: extInfo.icon || '🧩',
        enabled: true,
        builtin: false,
        source: 'chrome-web-store',
        url: extInfo.url || null,
        installedAt: Date.now()
    };
    installed.push(newExt);
    saveJSON(installedExtPath, installed);
    return installed;
});

ipcMain.handle('get-installed-extensions', () => loadJSON(installedExtPath, []));

ipcMain.handle('remove-installed-extension', (e, id) => {
    let installed = loadJSON(installedExtPath, []);
    installed = installed.filter(x => x.id !== id);
    saveJSON(installedExtPath, installed);
    return installed;
});

ipcMain.handle('toggle-installed-extension', (e, { id, enabled }) => {
    const installed = loadJSON(installedExtPath, []);
    const ext = installed.find(x => x.id === id);
    if (ext) { ext.enabled = enabled; saveJSON(installedExtPath, installed); }
    return installed;
});

// ============================================================
// FILES / DOWNLOADS
// ============================================================
ipcMain.on('open-downloads-folder', () => {
    const s = loadJSON(settingsPath, DEFAULT_SETTINGS);
    const dir = s.downloadPath || app.getPath('downloads');
    shell.openPath(dir);
});
ipcMain.on('open-file', (e, filePath) => shell.openPath(filePath));
ipcMain.on('show-in-folder', (e, filePath) => shell.showItemInFolder(filePath));

ipcMain.handle('select-download-folder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
});

// ============================================================
// SHORTCUTS
// ============================================================
ipcMain.handle('get-shortcuts', () => loadJSON(shortcutsPath, []));
ipcMain.handle('save-shortcut', (e, shortcut) => {
    const list = loadJSON(shortcutsPath, []);
    list.push({ ...shortcut, id: Date.now().toString() });
    saveJSON(shortcutsPath, list);
    return list;
});
ipcMain.handle('delete-shortcut', (e, id) => {
    let list = loadJSON(shortcutsPath, []);
    list = list.filter(s => s.id !== id);
    saveJSON(shortcutsPath, list);
    return list;
});
ipcMain.handle('rename-shortcut', (e, { id, name }) => {
    const list = loadJSON(shortcutsPath, []);
    const item = list.find(s => s.id === id);
    if (item) { item.name = name; saveJSON(shortcutsPath, list); }
    return list;
});
ipcMain.handle('get-favicon', async (e, url) => {
    try { const u = new URL(url); return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`; }
    catch { return null; }
});

// ============================================================
// SIDEBAR
// ============================================================
ipcMain.handle('get-sidebar-items', () => loadJSON(sidebarPath, []));
ipcMain.handle('add-sidebar-item', (e, item) => {
    const list = loadJSON(sidebarPath, []);
    const newItem = { ...item, id: Date.now().toString() };
    list.push(newItem);
    saveJSON(sidebarPath, list);
    return list;
});
ipcMain.handle('remove-sidebar-item', (e, id) => {
    let list = loadJSON(sidebarPath, []);
    list = list.filter(s => s.id !== id);
    saveJSON(sidebarPath, list);
    return list;
});
ipcMain.handle('update-sidebar-item', (e, { id, updates }) => {
    const list = loadJSON(sidebarPath, []);
    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...updates }; saveJSON(sidebarPath, list); }
    return list;
});

// ============================================================
// BACKGROUNDS
// ============================================================
ipcMain.handle('pick-background-image', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const res = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
});
ipcMain.handle('pick-background-video', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const res = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'ogg', 'mov', 'mkv'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
});
ipcMain.handle('pick-background-music', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const res = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] }]
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
});

// ============================================================
// GAMES
// ============================================================
ipcMain.handle('get-games', async () => {
    const gamesDir = path.join(app.getAppPath(), 'games');
    if (!fs.existsSync(gamesDir)) { fs.mkdirSync(gamesDir); return []; }
    const files = fs.readdirSync(gamesDir);
    const gamesList = [];
    files.forEach(file => {
        const fullPath = path.join(gamesDir, file);
        const isDirectory = fs.statSync(fullPath).isDirectory();
        if (isDirectory) {
            const gameIndexPath = path.join(fullPath, 'index.html');
            if (fs.existsSync(gameIndexPath)) {
                gamesList.push({ id: file.toLowerCase().replace(/\s+/g, '-'), name: file, file: `file://${gameIndexPath.replace(/\\/g, '/')}` });
            }
        } else if (file.toLowerCase().endsWith('.html')) {
            const id = file.replace(/\.html$/i, '');
            const name = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            gamesList.push({ id, name, file: `file://${fullPath.replace(/\\/g, '/')}` });
        }
    });
    return gamesList.sort((a, b) => a.name.localeCompare(b.name));
});
ipcMain.handle('get-games-url', () => 'file://' + path.join(__dirname, 'games.html').replace(/\\/g, '/'));

// ============================================================
// SITE BLOCKER
// ============================================================
const siteBlockerPath = path.join(userData, 'site-blocker.json');

function loadSiteBlocker() {
    return loadJSON(siteBlockerPath, { password: null, sites: [] });
}
function saveSiteBlocker(data) {
    saveJSON(siteBlockerPath, data);
}

function normalizeDomain(input) {
    if (!input) return '';
    try {
        let s = String(input).trim().toLowerCase();
        s = s.replace(/^[a-z]+:\/\//i, '');
        s = s.split('/')[0].split('?')[0].split('#')[0];
        s = s.split(':')[0];
        s = s.replace(/^www\./i, '');
        return s;
    } catch { return ''; }
}

ipcMain.handle('get-site-blocker', () => {
    const data = loadSiteBlocker();
    return { hasPassword: !!data.password, sites: data.sites || [] };
});

ipcMain.handle('set-site-blocker-password', (e, { oldPassword, newPassword }) => {
    const data = loadSiteBlocker();
    if (data.password && data.password !== oldPassword) {
        return { success: false, error: 'Wrong password' };
    }
    data.password = newPassword;
    saveSiteBlocker(data);
    return { success: true };
});

ipcMain.handle('verify-site-blocker-password', (e, password) => {
    const data = loadSiteBlocker();
    return data.password === password;
});

ipcMain.handle('add-blocked-site', (e, { password, site }) => {
    const data = loadSiteBlocker();
    if (data.password !== password) return { success: false, error: 'Wrong password' };
    const normalized = normalizeDomain(site);
    if (!normalized || !normalized.includes('.')) {
        return { success: false, error: 'Invalid domain' };
    }
    if (!data.sites.includes(normalized)) {
        data.sites.push(normalized);
        saveSiteBlocker(data);
    }
    return { success: true, sites: data.sites };
});

ipcMain.handle('remove-blocked-site', (e, { password, site }) => {
    const data = loadSiteBlocker();
    if (data.password !== password) return { success: false, error: 'Wrong password' };
    const normalized = normalizeDomain(site);
    data.sites = data.sites.filter(s => normalizeDomain(s) !== normalized);
    saveSiteBlocker(data);
    return { success: true, sites: data.sites };
});

ipcMain.handle('check-blocked-site', (e, url) => {
    const data = loadSiteBlocker();
    if (!data.sites || !data.sites.length) return { blocked: false };
    try {
        const hostname = normalizeDomain(url);
        if (!hostname) return { blocked: false };
        for (const site of data.sites) {
            const s = normalizeDomain(site);
            if (!s) continue;
            if (hostname === s || hostname.endsWith('.' + s)) {
                return { blocked: true, site: s };
            }
        }
    } catch {}
    return { blocked: false };
});
