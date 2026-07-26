import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Audit } from './cloudflare-phase-7-audit-policy.mjs';
import {
    AUDIT_VIEW_FIELDS, auditAccessDecision, projectAuditEvent, narrowFilters, auditActivityModel
} from '../js/collaboration/audit-activity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Audit({
    manifest: JSON.parse(read('config/cloudflare/phase-7-audit-activity.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/audit-activity.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    // The rendered field set is compared to the contract's own declaration.
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    unitTestSource: read('tests/collaboration-audit-activity.test.mjs'),
    journeyExports: {
        AUDIT_VIEW_FIELDS, auditAccessDecision, projectAuditEvent, narrowFilters,
        auditActivityModel,
        sampleEvent: {
            eventId: '66666666-6666-4666-8666-666666666666',
            workspaceId: '55555555-5555-4555-8555-555555555555',
            schemaVersion: 1, eventType: 'membership.role.changed',
            occurredAt: 1780000000000, order: 7,
            requestId: '11111111-1111-4111-8111-111111111111', outcome: 'success'
        }
    }
});

console.log('Cloudflare Phase 7 audit activity gate passed');
console.log('  CF-P7-011: PASS; P7-G3D authorizes CF-P7-012 only');
console.log('  Every row is projected onto the frozen allow-list, and a stray field is refused');
console.log('  Three filters only; a content query over the log is refused outright');
console.log('  Restricted to owner and admin, explained rather than hidden from the rest');
