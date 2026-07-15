import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPagesSnapshot, validatePagesSnapshotDocument } from './cloudflare-config-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'config/cloudflare/pages-project-baseline.json');
const candidateFlag = process.argv.indexOf('--candidate');
const candidatePath = candidateFlag === -1
    ? baselinePath
    : path.resolve(process.cwd(), process.argv[candidateFlag + 1] || '');

if (candidateFlag !== -1 && !process.argv[candidateFlag + 1]) {
    throw new Error('--candidate requires a sanitized snapshot path');
}

const baseline = readPagesSnapshot(baselinePath);
const candidate = readPagesSnapshot(candidatePath);
validatePagesSnapshotDocument(candidate, baseline);

console.log('Cloudflare Pages configuration policy passed');
console.log('  Project: docvault-qa-document-hub');
console.log('  Production branch: main');
console.log('  Output directory: _site');
console.log('  Candidate:', path.relative(root, candidatePath) || 'baseline');
