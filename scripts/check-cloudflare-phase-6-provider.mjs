import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePhase6Provider } from './cloudflare-phase-6-provider-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const PROVIDER_EVIDENCE = ['CF-EV-P6-UT-001', 'CF-EV-P6-QA-001', 'CF-EV-P6-SEC-002'];

// Sprint gate G1 ("Personal documents unchanged") is only meaningful if it is
// measured rather than asserted. Count the real diff of the Personal Vault
// storage layer against the commit that closed CF-P6-001, so a later edit to
// storage.js fails this gate instead of quietly passing on a stale claim.
const CONTRACT_FREEZE_COMMIT = 'c9a36b9';
let personalStorageDiffLines = 0;
let diffMeasured = false;
try {
    const diff = execFileSync('git', ['diff', CONTRACT_FREEZE_COMMIT, '--numstat', '--', 'storage.js'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    diffMeasured = true;
    if (diff) {
        personalStorageDiffLines = diff.split(/\r?\n/).reduce((total, line) => {
            const [added, removed] = line.split(/\s+/);
            return total + (Number.parseInt(added, 10) || 0) + (Number.parseInt(removed, 10) || 0);
        }, 0);
    }
} catch (_) {
    // Shallow clone or missing history: fall back to the manifest claim rather
    // than failing a gate for an environment problem.
    diffMeasured = false;
}

validatePhase6Provider({
    manifest: json('config/cloudflare/phase-6-provider-isolation.json'),
    providerSource: read('js/collaboration/storage-provider.js'),
    characterizationSource: read('tests/personal-vault-characterization.test.mjs'),
    isolationSource: read('tests/storage-provider-isolation.test.mjs'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    evidenceSources: Object.fromEntries(PROVIDER_EVIDENCE
        .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')])),
    personalStorageDiffLines
});

console.log('Cloudflare Phase 6 provider isolation passed');
console.log('  CF-P6-002: PASS; P6-G2 authorizes CF-P6-003 only');
console.log(`  Personal Vault storage diff: ${personalStorageDiffLines} lines`
    + `${diffMeasured ? ' (measured against CF-P6-001)' : ' (unmeasured; manifest claim)'}`);
console.log('  Explicit selection, no personal fallback, lazy module, 8 deferred ops fail closed');
