import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Account } from './cloudflare-phase-7-account-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Account({
    manifest: JSON.parse(read('config/cloudflare/phase-7-account-workspace.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    contextSource: read('js/collaboration/workspace-context.js'),
    accountSource: read('js/collaboration/account-menu.js'),
    switcherSource: read('js/collaboration/workspace-switcher.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    unitTestSource: read('tests/collaboration-account-workspace.test.mjs')
});

console.log('Cloudflare Phase 7 account and workspace gate passed');
console.log('  CF-P7-003: PASS; P7-G2A authorizes CF-P7-004 only');
console.log('  U2 held: the active workspace reads without opening a menu and survives reload');
console.log('  An unavailable workspace never silently falls back to another');
console.log('  Disclosures track aria-expanded and restore focus; roles carry badges');
