const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    openNewWindow: (incognito) => ipcRenderer.send('open-new-window', { incognito: !!incognito }),

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // Adblocker
    setAdblockEnabled: (enabled) => ipcRenderer.invoke('set-adblock-enabled', enabled),
    getAdblockStatus: () => ipcRenderer.invoke('get-adblock-status'),
    setYoutubeSkipEnabled: (enabled) => ipcRenderer.invoke('set-youtube-skip-enabled', enabled),

    // History
    getHistory: () => ipcRenderer.invoke('get-history'),
    addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    removeHistoryItem: (url) => ipcRenderer.invoke('remove-history-item', url),

    // Extensions
    getExtensions: () => ipcRenderer.invoke('get-extensions'),
    toggleExtension: (id, enabled) => ipcRenderer.invoke('toggle-extension', { id, enabled }),
    installChromeExtension: (extInfo) => ipcRenderer.invoke('install-chrome-extension', extInfo),
    getInstalledExtensions: () => ipcRenderer.invoke('get-installed-extensions'),
    removeInstalledExtension: (id) => ipcRenderer.invoke('remove-installed-extension', id),
    toggleInstalledExtension: (id, enabled) => ipcRenderer.invoke('toggle-installed-extension', { id, enabled }),

    // Files / Downloads
    openDownloadsFolder: () => ipcRenderer.send('open-downloads-folder'),
    openFile: (filePath) => ipcRenderer.send('open-file', filePath),
    showInFolder: (filePath) => ipcRenderer.send('show-in-folder', filePath),
    selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),

    // Events
    onDownloadStarted: (cb) => ipcRenderer.on('download-started', (e, d) => cb(d)),
    onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (e, d) => cb(d)),
    onDownloadDone: (cb) => ipcRenderer.on('download-done', (e, d) => cb(d)),
    onResourceUpdate: (cb) => ipcRenderer.on('resource-update', (e, d) => cb(d)),

    // Games
    getGames: () => ipcRenderer.invoke('get-games'),
    getGamesUrl: () => ipcRenderer.invoke('get-games-url'),

    // Shortcuts
    getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
    saveShortcut: (shortcut) => ipcRenderer.invoke('save-shortcut', shortcut),
    deleteShortcut: (id) => ipcRenderer.invoke('delete-shortcut', id),
    renameShortcut: (id, name) => ipcRenderer.invoke('rename-shortcut', { id, name }),
    getFavicon: (url) => ipcRenderer.invoke('get-favicon', url),

    // Sidebar
    getSidebarItems: () => ipcRenderer.invoke('get-sidebar-items'),
    addSidebarItem: (item) => ipcRenderer.invoke('add-sidebar-item', item),
    removeSidebarItem: (id) => ipcRenderer.invoke('remove-sidebar-item', id),
    updateSidebarItem: (id, updates) => ipcRenderer.invoke('update-sidebar-item', { id, updates }),

    // Backgrounds
    pickBackgroundImage: () => ipcRenderer.invoke('pick-background-image'),
    pickBackgroundVideo: () => ipcRenderer.invoke('pick-background-video'),
    pickBackgroundMusic: () => ipcRenderer.invoke('pick-background-music'),

    // Site Blocker
    getSiteBlocker: () => ipcRenderer.invoke('get-site-blocker'),
    setSiteBlockerPassword: (oldPassword, newPassword) => ipcRenderer.invoke('set-site-blocker-password', { oldPassword, newPassword }),
    verifySiteBlockerPassword: (password) => ipcRenderer.invoke('verify-site-blocker-password', password),
    addBlockedSite: (password, site) => ipcRenderer.invoke('add-blocked-site', { password, site }),
    removeBlockedSite: (password, site) => ipcRenderer.invoke('remove-blocked-site', { password, site }),
    checkBlockedSite: (url) => ipcRenderer.invoke('check-blocked-site', url),

    // ===== Context Menu (right click) =====
    showContextMenu: (params) => ipcRenderer.send('show-context-menu', params),
    onContextMenuCommand: (cb) => ipcRenderer.on('context-menu-command', (e, cmd) => cb(cmd)),

    // ===== Page source / DevTools =====
    openPageSource: (url) => ipcRenderer.send('open-page-source', url),
    openDevTools: (url) => ipcRenderer.send('open-devtools', url),

    // ===== Google Lens / AI search =====
    searchWithLens: (imageUrl) => ipcRenderer.send('search-with-lens', imageUrl),
    searchWithAI: (text) => ipcRenderer.send('search-with-ai', text),
});
