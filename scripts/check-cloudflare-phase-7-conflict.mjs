import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Conflict } from './cloudflare-phase-7-conflict-policy.mjs';
import {
    conflictDialogModel, dismissDialog, chooseResolution, requestAutomaticMerge
} from '../js/collaboration/conflict-dialog.js';
import { openConflict } from '../js/collaboration/conflict-resolution.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Conflict({
    manifest: JSON.parse(read('config/cloudflare/phase-7-conflict-dialog.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/conflict-dialog.js'),
    serviceSource: read('js/collaboration/conflict-resolution.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    unitTestSource: read('tests/collaboration-conflict-dialog.test.mjs'),
    // Every U4 guard is driven to its refusal rather than matched as a pattern.
    journeyExports: {
        conflictDialogModel, dismissDialog, chooseResolution, requestAutomaticMerge,
        sampleConflict: openConflict({
            conflictId: '77777777-7777-4777-8777-777777777777',
            documentId: '88888888-8888-4888-8888-888888888888',
            submittedBaseRevision: 3, currentRevision: 5,
            draft: new Uint8Array([1, 2, 3]), now: 1
        })
    }
});

console.log('Cloudflare Phase 7 conflict dialog gate passed');
console.log('  CF-P7-010: PASS; P7-G3C authorizes CF-P7-011 only');
console.log('  U4 held: dismissing decides nothing and the draft is kept');
console.log('  Discarding needs arming and confirming, and is withheld without a held draft');
console.log('  No automatic merge is offered, and the service refuses one');
console.log('  The dialog opens no persistence path of its own');
