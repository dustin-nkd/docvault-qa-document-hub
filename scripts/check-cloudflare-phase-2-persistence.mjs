import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2PersistenceFoundation } from './cloudflare-phase-2-persistence-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const foundation = JSON.parse(read('config/cloudflare/phase-2-persistence-foundation.json'));
const sourceDirectory = path.join(root, 'functions/_lib/persistence');

validatePhase2PersistenceFoundation({
    foundation,
    sources: Object.fromEntries(fs.readdirSync(sourceDirectory)
        .filter(name => name.endsWith('.ts'))
        .map(name => [name, fs.readFileSync(path.join(sourceDirectory, name), 'utf8')])),
    apiSources: {
        shell: read('functions/_lib/api-shell.mjs'),
        route: read('functions/api/v1/[[path]].ts')
    },
    evidenceSources: Object.fromEntries(foundation.evidence.map(id => [
        id,
        read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)
    ])),
    wrangler: JSON.parse(read('wrangler.jsonc'))
});

console.log('Cloudflare Phase 2 typed persistence foundation gate passed');
console.log('  Guarded batch: guard -> domain -> exactly one audit -> deterministic result');
console.log('  Reads/writes: bounded, explicitly mapped, and checked for exact changes');
console.log('  Authorization consistency: server-owned first-primary/bookmark sessions');
console.log('  API: disabled and persistence-unreachable; remote D1 remains prohibited');
