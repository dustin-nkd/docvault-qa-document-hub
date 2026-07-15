// Apply paint-critical preferences before the application renders, then register
// the offline shell after the page is ready. Keeping this code in a same-origin
// asset allows production to enforce a strict script-src CSP without inline code.
(() => {
    try {
        document.documentElement.setAttribute('data-theme', localStorage.getItem('qahub_theme') || 'dark');
    } catch (_) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((error) => {
                console.warn('[DocVault] Service worker registration failed; offline mode is unavailable.', error);
            });
        });
    }
})();
