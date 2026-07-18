import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase5Primitives } from './cloudflare-phase-5-primitives-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
validatePhase5Primitives({
    manifest: json('config/cloudflare/phase-5-crypto-primitives.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    contractFreeze: json('config/cloudflare/phase-5-contract-freeze.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTest: read('tests/cloudflare/e2ee-primitives.workers.test.ts'),
    referenceTest: read('tests/cloudflare-phase-5-reference-vectors.test.mjs'),
    vectorFixture: json('tests/fixtures/cloudflare/phase-5-crypto-vectors.json'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'),
    migrationManifest: json('migrations/manifest.json'), wrangler: json('wrangler.jsonc'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-crypto-primitives.md')
});
console.log('Cloudflare CF-P5-002 crypto primitive gate passed');
console.log('  Workers Web Crypto: 10 cases; independent Node oracle: 3 cases');
console.log('  Immutable vectors: 30 synthetic cases across 6 families; agreement: 100%');
console.log('  Routes, migration 11, remote D1, Preview activation, and Production: unchanged');
