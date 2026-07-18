import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase4PreviewApi } from './cloudflare-phase-4-preview-api-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase4PreviewApi({
    manifest: json('config/cloudflare/phase-4-preview-api-integration.json'),
    prerequisite: json('config/cloudflare/phase-4-audit-scoped-reads.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/preview-api-integration.workers.test.ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
        read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)])),
    report: read('docs/collaboration-foundation/phase-4-preview-api-integration.md')
});

console.log('Cloudflare Phase 4 Preview API integration gate passed');
console.log('  CF-P4-007: PASS; Preview operations: 11; Workers tests: 4');
console.log('  Production/GitHub Pages activation, migrations, and remote D1 mutations: zero');
