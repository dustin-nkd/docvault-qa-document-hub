// DocVault service worker — caches the app shell so the PWA installs and keeps
// working fully offline after a first successful load. Bump SW_VERSION whenever
// shipped files change; the old cache is purged on activate so nothing gets
// permanently stuck on stale code.
const SW_VERSION = 'v44'; // Strict CSP bootstrap and production security headers
const CACHE_PREFIX = 'docvault-shell-';
const CACHE_NAME = CACHE_PREFIX + SW_VERSION;

const APP_SHELL = [
    './',
    './index.html',
    './js/bootstrap.js',
    './storage.js',
    './style.css',
    './manifest.json',
    './js/constants.js',
    './js/utils.js',
    './js/state.js',
    './js/ui.js',
    './js/render-core.js',
    './js/render-trends.js',
    './js/render-editor-categories.js',
    './js/render-editor.js',
    './js/render-viewer-categories.js',
    './js/render-viewer.js',
    './js/actions-batch-history.js',
    './js/actions-sharing.js',
    './js/actions-imports.js',
    './js/actions-settings.js',
    './js/actions-documents.js',
    './js/actions-focus.js',
    './js/search.js',
    './js/events.js',
    './vendor/tailwind/tailwind.generated.css',
    './vendor/toastui/toastui-editor.min.css',
    './vendor/toastui/toastui-editor-dark.min.css',
    './vendor/toastui/toastui-editor-all.min.js',
    './vendor/morphdom/morphdom-umd.min.js',
    './vendor/fonts/space-grotesk/runtime.css',
    './vendor/fonts/dm-sans/runtime.css',
    './vendor/fontawesome/css/all.min.css',
    './icons/icon16.png',
    './icons/icon48.png',
    './icons/icon128.png',
    './icons/icon.svg'
];

self.addEventListener('install', (event) => {
    // Precache is atomic from the worker lifecycle's perspective: if any required
    // shell asset fails, installation fails and the currently active worker keeps
    // serving its known-good cache instead of activating an incomplete one.
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names
                .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                .map((name) => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Never intercept cross-origin requests (GitHub API sync/push/pull, share
    // links, image CDN uploads) or non-GET requests. Sync and sharing must always
    // hit the live network — caching or blocking them here would silently break
    // cross-device sync or serve stale vault data.
    if (url.origin !== self.location.origin || req.method !== 'GET') return;

    // Network-first for same-origin app-shell files: an online visitor always
    // gets the latest deployed code, and the cache is refreshed on every
    // successful fetch. Only falls back to the cache (or the cached index.html,
    // for any navigation/query-string variant like ?guest=1 or ?view=...) when
    // the network is unavailable.
    event.respondWith(
        fetch(req).then((res) => {
            if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => cache.put(req, copy))
                    .catch((error) => console.warn('[DocVault SW] Could not refresh cached resource:', req.url, error));
            }
            return res;
        }).catch(async () => {
            const cached = await caches.match(req);
            if (cached) return cached;
            if (req.mode === 'navigate') {
                const shell = await caches.match('./index.html');
                if (shell) return shell;
            }
            return new Response('Offline — resource is not available in the app cache.', {
                status: 503,
                statusText: 'Offline',
                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-DocVault-Offline': '1' }
            });
        })
    );
});
