// DocVault public Firebase configuration
// Project: docvault-qa-team
(function(root) {
    // Redirect sign-in only survives browser storage partitioning when the
    // auth handler is served from the same host as the page. web.app and
    // firebaseapp.com are different sites, so a fixed firebaseapp.com domain
    // drops the session after Google returns.
    const host = root.location?.hostname || '';
    const sameOriginAuth = host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');
    root.FIREBASE_CONFIG = {
        apiKey: 'AIzaSyDon-SynEWRmTpTEN3v0kodz6Qh6Ch7YTo',
        authDomain: sameOriginAuth ? host : 'docvault-qa-team.web.app',
        projectId: 'docvault-qa-team',
        appId: '1:1097938311241:web:f5d149fb8b71ed7ebc8798',
        messagingSenderId: '1097938311241'
    };
})(typeof window !== 'undefined' ? window : globalThis);
