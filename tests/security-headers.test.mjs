import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function parseHeadersFile(content) {
    const map = {};
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0 && !trimmed.startsWith('/*')) {
            const key = trimmed.slice(0, colonIdx).trim();
            const val = trimmed.slice(colonIdx + 1).trim();
            map[key] = val;
        }
    }
    return map;
}

function parseFirebaseJsonHeaders(content) {
    const parsed = JSON.parse(content);
    const headersList = parsed?.hosting?.headers?.[0]?.headers || [];
    const map = {};
    for (const item of headersList) {
        map[item.key] = item.value;
    }
    return map;
}

test('production headers enforce a strict script policy and browser hardening across _headers and firebase.json', () => {
    const headersRaw = read('_headers');
    assert.match(headersRaw, /^\/\*$/m);

    const headersFile = parseHeadersFile(headersRaw);
    const firebaseJson = parseFirebaseJsonHeaders(read('firebase.json'));

    const requiredHeaders = [
        'Content-Security-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Cross-Origin-Opener-Policy'
    ];

    for (const headerKey of requiredHeaders) {
        assert.ok(headersFile[headerKey], `_headers missing required header: ${headerKey}`);
        assert.ok(firebaseJson[headerKey], `firebase.json missing required header: ${headerKey}`);
        assert.equal(
            firebaseJson[headerKey],
            headersFile[headerKey],
            `Header mismatch between _headers and firebase.json for ${headerKey}`
        );
    }

    for (const [sourceName, headerMap] of [['_headers', headersFile], ['firebase.json', firebaseJson]]) {
        const csp = headerMap['Content-Security-Policy'];
        assert.match(csp, /default-src 'self'/, `${sourceName}: CSP must include default-src 'self'`);
        assert.match(csp, /script-src 'self' https:\/\/apis\.google\.com https:\/\/www\.gstatic\.com/, `${sourceName}: CSP must allow the Firebase auth script hosts`);
        assert.match(csp, /script-src-elem 'self' https:\/\/apis\.google\.com https:\/\/www\.gstatic\.com/, `${sourceName}: CSP must allow those hosts on script elements`);
        assert.match(csp, /script-src-attr 'none'/, `${sourceName}: CSP must include script-src-attr 'none'`);
        assert.match(csp, /frame-src 'self'/, `${sourceName}: CSP must allow the same-origin Firebase auth iframe`);
        assert.doesNotMatch(csp, /frame-src[^;]*\*/, `${sourceName}: CSP must not allow every frame host`);
        assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, `${sourceName}: CSP script-src must not allow 'unsafe-inline'`);

        assert.equal(headerMap['Cross-Origin-Opener-Policy'], 'same-origin', `${sourceName}: COOP must be same-origin`);
        assert.match(headerMap['Strict-Transport-Security'], /max-age=\d+; includeSubDomains/, `${sourceName}: HSTS must include max-age and includeSubDomains`);
        assert.equal(headerMap['X-Content-Type-Options'], 'nosniff', `${sourceName}: X-Content-Type-Options must be nosniff`);
        assert.equal(headerMap['X-Frame-Options'], 'DENY', `${sourceName}: X-Frame-Options must be DENY`);
        assert.equal(headerMap['Referrer-Policy'], 'strict-origin-when-cross-origin', `${sourceName}: Referrer-Policy must be strict-origin-when-cross-origin`);
        assert.match(headerMap['Permissions-Policy'], /camera=\(\)/, `${sourceName}: Permissions-Policy must disable camera`);
    }
});

test('runtime contains no CSP-blocked inline scripts or native event attributes', () => {
    const html = read('index.html');
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(match => !/\bsrc\s*=/.test(match[1]));
    assert.deepEqual(inlineScripts, [], 'All executable scripts must be same-origin assets');

    const runtimeFiles = ['index.html', ...fs.readdirSync(path.join(root, 'js'))
        .filter(file => file.endsWith('.js'))
        .map(file => `js/${file}`)];
    const nativeEventAttribute = /(?<!data-)\son(?:click|submit|load|error|change|input|keydown|keyup|keypress|mouseover|mouseout|mouseenter|mouseleave|focus|blur|dragstart|dragend|dragover|drop|touchstart|touchmove|touchend)\s*=\s*["']/i;
    for (const relative of runtimeFiles) {
        assert.doesNotMatch(read(relative), nativeEventAttribute, `${relative} contains a native event attribute`);
    }
});

test('security policy and bootstrap are shipped in the production artifact and offline shell', () => {
    assert.match(read('scripts/build-pages.mjs'), /include\('_headers'\)/);
    assert.match(read('sw.js'), /'\.\/js\/bootstrap\.js'/);
    assert.match(read('index.html'), /<script src="js\/bootstrap\.js"><\/script>/);
});
