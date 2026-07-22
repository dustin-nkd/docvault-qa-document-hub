import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5DeviceKeyLifecycle } from './cloudflare-phase-5-device-key-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
validatePhase5DeviceKeyLifecycle({
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
console.log('Cloudflare CF-P5-003 browser device-key lifecycle gate passed');
console.log('  Encrypted-only IndexedDB; non-extractable deriveBits key; uniform local failure');
console.log('  Chromium, Firefox, and WebKit qualification enforced in release E2E');
console.log('  Historical story scope preserved; current sequence 11 is the later approved CF-P5-004 correction');
