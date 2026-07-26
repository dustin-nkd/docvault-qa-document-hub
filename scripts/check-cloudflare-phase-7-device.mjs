import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Device } from './cloudflare-phase-7-device-policy.mjs';
import { DEVICE_SUITE, KEY_READINESS, presentReadiness }
    from '../js/collaboration/device-initialization.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Device({
    manifest: JSON.parse(read('config/cloudflare/phase-7-device-initialization.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/device-initialization.js'),
    lifecycleSource: read('js/collaboration/device-key-lifecycle.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    // The rendered readiness set is compared against the server that produces
    // it, so the surface cannot go stale without the gate noticing.
    serverReadinessSource: read('functions/_lib/workspace-keys/workspace-key-service.ts'),
    browserTestSource: read('tests/browser-device-key-lifecycle.mjs'),
    unitTestSource: read('tests/collaboration-device-initialization.test.mjs'),
    journeyExports: { DEVICE_SUITE, KEY_READINESS, presentReadiness }
});

console.log('Cloudflare Phase 7 device and key initialization gate passed');
console.log('  CF-P7-005: PASS; P7-G2C authorizes CF-P7-006 only');
console.log('  Enrol, register, compare the fingerprint, then re-bind — in that order');
console.log('  The re-bind moves the existing key and never mints new material');
console.log('  All five server readiness values render, and waiting is not an error');
console.log('  Revocation reaches the server before the local key is deleted');
