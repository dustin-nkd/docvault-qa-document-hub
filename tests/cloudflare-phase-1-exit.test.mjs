import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase1ExitGate } from '../scripts/cloudflare-phase-1-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function actualInput() {
    const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-1');
    return {
        manifest: JSON.parse(read('config/cloudflare/phase-1-exit-gate.json')),
        evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory)
            .filter(name => /^CF-EV-P1-.*\.md$/.test(name))
            .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
        packageJson: JSON.parse(read('package.json')),
        wrangler: JSON.parse(read('wrangler.jsonc')),
        configurationDiff: JSON.parse(read('config/cloudflare/pages-wrangler-diff.json')),
        riskRegister: read('docs/collaboration-foundation/risk-register.md'),
        exitReport: read('docs/collaboration-foundation/phase-1-exit-report.md'),
        asOf: new Date('2026-07-16T00:00:00Z')
    };
}

test('Phase 1 exit manifest closes every story and evidence record without activating collaboration', () => {
    assert.equal(validatePhase1ExitGate(actualInput()), true);
});

test('Phase 1 exit gate rejects missing evidence, reviewers, exceptions, activation, and remote state', () => {
    const cases = [
        input => { delete input.evidenceSources['CF-EV-P1-SEC-007']; },
        input => { input.manifest.stories[0].reviewers = []; },
        input => { input.manifest.quality_exceptions.accepted_flakiness = ['case-1']; },
        input => { input.manifest.recommendation.collaboration_activation = 'GO'; },
        input => { input.manifest.production_boundary.remote_binding_names = ['COLLAB_DB']; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase1ExitGate(input));
    }
});

test('Phase 1 exit gate rejects expired risk review and unowned or open risks', () => {
    const expired = actualInput();
    expired.asOf = new Date('2026-10-16T00:00:00Z');
    assert.throws(() => validatePhase1ExitGate(expired), /expired/);

    const unowned = actualInput();
    unowned.riskRegister = unowned.riskRegister.replace('| Security Reviewer | Senior QA |', '|  | Senior QA |');
    assert.throws(() => validatePhase1ExitGate(unowned), /ownership/);

    const open = actualInput();
    open.riskRegister = open.riskRegister.replace('| Controlled pending evidence |', '| Open |');
    assert.throws(() => validatePhase1ExitGate(open), /open risk/);
});
