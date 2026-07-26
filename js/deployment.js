// Deployment awareness for the app shell.
//
// This file is deliberately NOT under js/collaboration/. Phase 7 budgets zero
// collaboration modules on Personal startup, and the GitHub Pages banner has to
// render for a user who will never load collaboration at all — telling them why
// the feature is absent is the whole point. So the predicate lives in the shell,
// stays dependency-free, and js/collaboration/shell.js reads the same answer
// rather than deciding again.
//
// Classic script, matching the rest of js/*.js. It publishes one frozen object.

(() => {
    'use strict';

    const CLOUDFLARE_SUFFIX = '.pages.dev';
    const GITHUB_PAGES_SUFFIX = '.github.io';
    const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

    /**
     * Where collaboration can run. Availability is a property of the deployment,
     * never of the user: a signed-out visitor on Cloudflare still gets
     * `available`, because the reason they cannot collaborate is authentication,
     * which is a different message.
     *
     * @param {{hostname?: string, protocol?: string}} location
     * @returns {{available: boolean, reason: string, target: string}}
     */
    function evaluate(location) {
        const hostname = String(location?.hostname ?? '').toLowerCase();
        if (LOCAL_HOSTS.includes(hostname)) {
            return { available: true, reason: 'local-development', target: 'local' };
        }
        if (hostname.endsWith(CLOUDFLARE_SUFFIX)) {
            return { available: true, reason: 'cloudflare-deployment', target: 'cloudflare' };
        }
        if (hostname.endsWith(GITHUB_PAGES_SUFFIX)) {
            return { available: false, reason: 'github-pages', target: 'github-pages' };
        }
        // An unrecognised origin fails closed. Guessing that some custom domain
        // is the Cloudflare deployment would offer a feature that then 404s.
        return { available: false, reason: 'unsupported-origin', target: 'unknown' };
    }

    const BANNER_ID = 'collaboration-availability-banner';

    /**
     * Reveal the banner only where collaboration genuinely cannot run. The
     * element ships in the markup hidden, so no layout shift and no injection.
     *
     * @param {Document} doc
     * @param {{available: boolean, reason: string}} verdict
     */
    function applyBanner(doc, verdict) {
        const banner = doc.getElementById(BANNER_ID);
        if (banner === null) return false;
        if (verdict.available) {
            banner.hidden = true;
            return false;
        }
        banner.hidden = false;
        banner.setAttribute('data-reason', verdict.reason);
        return true;
    }

    const verdict = evaluate(typeof location === 'undefined' ? {} : location);

    window.DocVaultDeployment = Object.freeze({
        evaluate,
        applyBanner,
        bannerId: BANNER_ID,
        collaborationAvailable: verdict.available,
        reason: verdict.reason,
        target: verdict.target
    });

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded',
                () => applyBanner(document, verdict), { once: true });
        } else {
            applyBanner(document, verdict);
        }
    }
})();
