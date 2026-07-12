// DocVault service worker — caches the app shell so the PWA installs and keeps
// working fully offline after a first successful load. Bump SW_VERSION whenever
// shipped files change; the old cache is purged on activate so nothing gets
// permanently stuck on stale code.
const SW_VERSION = 'v12'; // dashboard: de-duplicate health signals and promote the action queue
const CACHE_NAME = `docvault-shell-${SW_VERSION}`;

const APP_SHELL = [
    './',
    './index.html',
    './storage.js',
    './main.js',
    './style.css',
    './manifest.json',
    './js/constants.js',
    './js/utils.js',
    './js/state.js',
    './js/ui.js',
    './js/render-core.js',
    './js/render-editor.js',
    './js/render-viewer.js',
    './js/actions.js',
    './js/search.js',
    './js/events.js',
    './vendor/tailwind/tailwind.generated.css',
    './vendor/toastui/toastui-editor.min.css',
    './vendor/toastui/toastui-editor-dark.min.css',
    './vendor/toastui/toastui-editor-all.min.js',
    './vendor/morphdom/morphdom-umd.min.js',
    './vendor/fonts/space-grotesk/index.css',
    './vendor/fonts/dm-sans/index.css',
    './vendor/fontawesome/css/all.min.css',
    './icons/icon16.png',
    './icons/icon48.png',
    './icons/icon128.png',
    './icons/icon.svg'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
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
                caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return res;
        }).catch(() =>
            caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
});
