import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_IDENTITY_EVIDENCE, validatePhase3PreviewIdentityPolicy }
    from '../scripts/cloudflare-phase-3-preview-identity-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
function input() {
    return { manifest: json('config/cloudflare/phase-3-preview-identity.json'),
        sprint: json('config/cloudflare/phase-3-sprint-plan.json'), wrangler: json('wrangler.jsonc'),
        burstWrangler: json('wrangler.identity-burst.jsonc'),
        runtimeSource: read('functions/_lib/identity/runtime-handler.ts'), workerSource: read('workers/identity-burst-limiter.ts'),
        evidenceSources: Object.fromEntries(PREVIEW_IDENTITY_EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)])) };
}

test('CF-P3-008 locks Preview provisioning, isolation, and cleanup evidence', () => {
    assert.equal(validatePhase3PreviewIdentityPolicy(input()), true);
});

test('CF-P3-008 rejects production activation, public exposure, cleanup, and evidence drift', () => {
    for (const mutate of [
        value => { value.wrangler.env.production.d1_databases = [{}]; },
        value => { value.burstWrangler.workers_dev = true; },
        value => { value.manifest.cleanup_counts.oauth_transactions = 1; },
        value => { delete value.evidenceSources['CF-EV-P3-SEC-008']; }
    ]) { const value = input(); mutate(value); assert.throws(() => validatePhase3PreviewIdentityPolicy(value)); }
});

test('CF-P3-008 rejects limiter authority and gate broadening', () => {
    for (const mutate of [
        value => { value.manifest.rate_control.edge_semantics = 'authoritative'; },
        value => { value.manifest.next_decision.authorizes = 'all-remaining-stories'; },
        value => { value.manifest.preview.business_routes_enabled = true; }
    ]) { const value = input(); mutate(value); assert.throws(() => validatePhase3PreviewIdentityPolicy(value)); }
});
