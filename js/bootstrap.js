// Register the offline shell after the page is ready. Keeping this code in a
// same-origin asset allows production to enforce a strict script-src CSP without
// inline code.
//
// DocVault ships a single dark theme, so there is no paint-critical theme
// preference to apply here — index.html hardcodes <html data-theme="dark">.
(() => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((error) => {
                console.warn('[DocVault] Service worker registration failed; offline mode is unavailable.', error);
            });
        });
    }
})();
