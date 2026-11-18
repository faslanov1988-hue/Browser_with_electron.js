// youtube-skip.js
// Yalnız YouTube-un öz "Skip Ad" düyməsinə basır.
// Əsas video elementinə TOXUNMUR — nə playbackRate, nə currentTime dəyişdirilmir.
// Beləliklə video başlamadan bitmir, yalnız reklam 5 saniyə sonra keçilir.
(function () {
    try {
        if (!location.hostname.includes('youtube.com')) return;

        const SKIP_SELECTORS = [
            '.ytp-ad-skip-button',
            '.ytp-skip-ad-button',
            '.ytp-ad-skip-button-modern',
            '.ytp-skip-ad-button-modern',
            '.ytp-ad-skip-button-slot button'
        ];

        function clickSkip() {
            for (const sel of SKIP_SELECTORS) {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled && btn.offsetParent !== null) {
                    try { btn.click(); } catch (e) {}
                    return;
                }
            }
        }

        // Hər 500ms yoxla — yüngül və təhlükəsiz
        setInterval(clickSkip, 500);

        console.log('[YT-Skip] minimal preload active (skip button only)');
    } catch (e) {
        console.error('[YT-Skip] error:', e.message);
    }
})();
