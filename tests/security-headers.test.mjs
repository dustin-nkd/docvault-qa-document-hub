import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('production headers enforce a strict script policy and browser hardening', () => {
    const headers = read('_headers');
    assert.match(headers, /^\/\*$/m);
    assert.match(headers, /Content-Security-Policy: .*default-src 'self'/);
    assert.match(headers, /script-src 'self'/);
    assert.match(headers, /script-src-attr 'none'/);
    assert.doesNotMatch(headers.match(/Content-Security-Policy: ([^\r\n]+)/)?.[1] || '', /script-src[^;]*'unsafe-inline'/);
    for (const header of [
        'Strict-Transport-Security',
        'X-Content-Type-Options: nosniff',
        'X-Frame-Options: DENY',
        'Referrer-Policy: strict-origin-when-cross-origin',
        'Permissions-Policy:',
        'Cross-Origin-Opener-Policy: same-origin'
    ]) assert.ok(headers.includes(header), `Missing required security header: ${header}`);
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
