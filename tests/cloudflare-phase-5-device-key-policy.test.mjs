import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5DeviceKeyLifecycle } from '../scripts/cloudflare-phase-5-device-key-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const input = () => ({
    manifest: json('config/cloudflare/phase-5-device-key-lifecycle.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    source: read('js/collaboration/device-key-lifecycle.js'),
    browserTest: read('tests/browser-device-key-lifecycle.mjs'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'),
    migrationManifest: json('migrations/manifest.json'), wrangler: json('wrangler.jsonc'),
    indexSource: read('index.html'), packageJson: json('package.json'), workflow: read('.github/workflows/deploy.yml'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-device-key-lifecycle.md')
});

test('CF-P5-003 locks the protected browser lifecycle, real-browser matrix, and disabled boundaries', () => {
    assert.equal(validatePhase5DeviceKeyLifecycle(input()), true);
});

test('CF-P5-003 rejects weaker crypto, plaintext persistence, lifecycle gaps, and activation', () => {
    for (const [name, mutate] of [
        ['iterations', value => { value.source = value.source.replace('600_000', '300_000'); }],
        ['plaintext', value => { value.source += '\nlocalStorage.setItem("privateKey", "plaintext");'; }],
        ['auto-lock', value => { value.manifest.implementation.auto_lock.pop(); }],
        ['browser matrix', value => { value.browserTest = value.browserTest.replaceAll('chromium, firefox, webkit', 'chromium'); }],
        ['eager load', value => { value.indexSource += '<script src="js/collaboration/device-key-lifecycle.js"></script>'; }],
        ['migration', value => { value.migrationManifest.entries.push({ sequence: 11 }); }],
        ['production', value => { value.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; }],
        ['evidence', value => { delete value.evidenceSources['CF-EV-P5-SEC-003']; }]
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5DeviceKeyLifecycle(value), undefined, name);
    }
});
