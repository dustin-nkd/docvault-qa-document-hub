import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Shell } from './cloudflare-phase-7-shell-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Shell({
    manifest: JSON.parse(read('config/cloudflare/phase-7-shell.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    deploymentSource: read('js/deployment.js'),
    baseStatesSource: read('js/collaboration/base-states.js'),
    shellSource: read('js/collaboration/shell.js'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    styleSource: read('style.css'),
    unitTestSource: read('tests/collaboration-shell.test.mjs')
});

console.log('Cloudflare Phase 7 shell gate passed');
console.log('  CF-P7-002: PASS; P7-G2 authorizes CF-P7-003 only');
console.log('  Collaboration stays lazy: no eager script tag, no precache entry');
console.log('  Four base states, distinct shapes, denials explain themselves');
console.log('  Unknown origins fail closed; the shell touches no personal storage');
