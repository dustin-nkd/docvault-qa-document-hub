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
     * Which environment a remembered workspace selection belongs to.
     *
     * The selection key is scoped by environment and subject so a Preview choice
     * can never be restored in Production. Pages names a production deployment
     * `<project>.pages.dev` and every preview `<something>.<project>.pages.dev`,
     * so the label count is the distinction — and where it is not recognised the
     * answer is `preview`, which is the conservative one: a selection that fails
     * to be restored costs a click, and one restored into the wrong environment
     * shows a user a workspace they did not choose.
     *
     * @param {string} hostname
     * @param {string} target
     */
    function environmentOf(hostname, target) {
        if (target === 'local') return 'local';
        if (target !== 'cloudflare') return 'preview';
        return hostname.split('.').length <= 3 ? 'production' : 'preview';
    }

    /**
     * Where collaboration *could* run. Availability is a property of the
     * deployment, never of the user: a signed-out visitor on Cloudflare still
     * gets `available`, because the reason they cannot collaborate is
     * authentication, which is a different message.
     *
     * This is deliberately only half the answer, and the cheap half. A hostname
     * cannot distinguish a Cloudflare deployment with collaboration enabled from
     * one with it disabled — they are the same string — so a `true` here means
     * "not ruled out", not "confirmed". The confirmation is the API's own
     * `COLLABORATION_UNAVAILABLE`, asked for by js/collaboration/entry.js after
     * the user opens collaboration.
     *
     * The split is why this file may not simply ask: it ships in the initial
     * payload for every visitor, and the Phase 7 budget is zero collaboration
     * work for a user who never opens collaboration. A probe here would spend
     * that budget on everyone to answer a question almost nobody asks.
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

    /**
     * `localStorage`, or nothing.
     *
     * Reading the property itself throws in some privacy configurations, so the
     * access is guarded rather than the use. A store that cannot be reached is
     * no remembered selection, which the entry already treats as a state rather
     * than an error.
     */
    function readableStore() {
        try {
            return window.localStorage || null;
        } catch (error) {
            return null;
        }
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

    const OPEN_ID = 'collaboration-open';
    const INVITATION_FRAGMENT = /^#\/invite\/[A-Za-z0-9_-]{16,512}$/;

    /**
     * An invitation link is an explicit request to enter collaboration.
     *
     * Ordinary Personal Vault startup must remain free of collaboration
     * modules, but requiring a second, unrelated click after following the
     * one-time link leaves the acceptance surface hidden. Match the same
     * fragment shape as the accepting entry before deciding to spend the lazy
     * import budget.
     */
    function hasInvitationFragment(candidate) {
        return INVITATION_FRAGMENT.test(String(candidate?.hash ?? ''));
    }

    /**
     * Reveal the way into collaboration, and make pressing it the only thing
     * that loads it.
     *
     * The dynamic import lives inside the handler on purpose: this file ships in
     * the initial payload, and the Phase 7 budget is zero collaboration modules
     * evaluated for a user who never opens collaboration. A top-level import
     * here would spend that budget on everyone.
     *
     * @param {Document} doc
     * @param {{available: boolean, reason: string}} availability
     */
    function bindCollaborationOpener(doc, availability) {
        const opener = doc.getElementById(OPEN_ID);
        if (opener === null) return false;
        if (!availability.available) {
            opener.hidden = true;
            return false;
        }
        opener.hidden = false;
        // The label the control returns to, so closing restores it rather than
        // leaving the button reading "Close" over a closed panel.
        const openLabel = opener.textContent;
        // Held across clicks so closing needs no second import: the module is
        // already evaluated by then, and re-importing to close what is open
        // would be the one case where pressing this spends the budget twice.
        let loaded = null;
        let open = false;

        // Closing is the same control, because there is no other one. The panel
        // is an overlay covering the Personal Vault, so without a way back the
        // only exit would be a page reload.
        function close() {
            if (loaded === null) return;
            loaded.closeCollaboration(doc);
            open = false;
            opener.textContent = openLabel;
            opener.setAttribute('aria-expanded', 'false');
        }

        opener.setAttribute('aria-expanded', 'false');
        opener.addEventListener('click', function () {
            if (open) {
                close();
                return;
            }
            opener.disabled = true;
            import('./collaboration/entry.js').then(function (module) {
                loaded = module;
                open = true;
                opener.disabled = false;
                opener.textContent = 'Close team workspaces';
                opener.setAttribute('aria-expanded', 'true');
                // `startCollaboration`, not `openCollaboration`: this verdict is
                // a hostname pre-filter and cannot tell a Cloudflare deployment
                // with collaboration switched on from one with it switched off.
                // The entry asks the deployment itself and renders that answer.
                //
                // The store, the environment, and the address bar are handed in
                // rather than reached for. Without the first two the entry can
                // never restore a remembered workspace, so every workspace-scoped
                // surface would stay empty for a returning user; without the
                // third an invitation link is a fragment nothing ever reads.
                return module.startCollaboration({
                    document: doc,
                    deployment: availability,
                    storage: readableStore(),
                    environment: environmentOf(
                        String(location.hostname || '').toLowerCase(), availability.target),
                    location: location,
                    history: history
                });
            }).catch(function () {
                // A failed load must never break the Personal Vault around it.
                opener.disabled = false;
                // Back to reading as an opener, not a Close over nothing.
                open = false;
                opener.textContent = openLabel;
                opener.setAttribute('aria-expanded', 'false');
            });
        });
        // Following a valid one-time invitation is already an explicit choice
        // to enter collaboration. Drive the exact registered opener so the
        // automatic and manual paths share loading, failure, close, and
        // accessibility behavior. Invalid or unrelated fragments stay lazy.
        if (hasInvitationFragment(
            typeof location === 'undefined' ? null : location)) opener.click();
        return true;
    }

    const verdict = evaluate(typeof location === 'undefined' ? {} : location);

    window.DocVaultDeployment = Object.freeze({
        evaluate,
        environmentOf,
        hasInvitationFragment,
        applyBanner,
        bindCollaborationOpener,
        bannerId: BANNER_ID,
        openerId: OPEN_ID,
        collaborationAvailable: verdict.available,
        reason: verdict.reason,
        target: verdict.target
    });

    if (typeof document !== 'undefined') {
        const start = () => {
            applyBanner(document, verdict);
            bindCollaborationOpener(document, verdict);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }
})();
