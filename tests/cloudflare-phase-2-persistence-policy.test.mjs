import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2PersistenceFoundation } from '../scripts/cloudflare-phase-2-persistence-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function actualInput() {
    const foundation = JSON.parse(read('config/cloudflare/phase-2-persistence-foundation.json'));
    const sourceDirectory = path.join(root, 'functions/_lib/persistence');
    return {
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
    };
}

// NO-OP CONTROL. Every assert.throws below is only meaningful if the UNMUTATED real
// input passes. Under D-P7-01 (preview COLLABORATION_ENABLED = 'true') a gate that had
// not been migrated would throw on the unmutated input, and every rejection case in this
// file would then pass for the wrong reason. This helper re-proves the control per case.
function assertRejects(mutate) {
    assert.doesNotThrow(() => validatePhase2PersistenceFoundation(actualInput()),
        'NO-OP CONTROL FAILED: unmutated input is already rejected, so this suite is vacuous');
    const input = actualInput();
    mutate(input);
    assert.throws(() => validatePhase2PersistenceFoundation(input));
}

test('CF-P2-004 locks typed, checked, bounded, atomic, and API-isolated persistence', () => {
    // NO-OP CONTROL: the real, unmutated repository state must pass under D-P7-01.
    assert.doesNotThrow(() => validatePhase2PersistenceFoundation(actualInput()));
    assert.equal(validatePhase2PersistenceFoundation(actualInput()), true);
});

test('CF-P2-004 rejects unsafe SQL, unchecked topology, and client-selected consistency', () => {
    const cases = [
        input => { input.sources['repository.ts'] += '\nconst unsafe = `SELECT * FROM users`;'; },
        input => { input.sources['repository.ts'] += '\nconst unsafe = `${clientSql}`;'; },
        input => { input.sources['authorization-session.ts'] = input.sources['authorization-session.ts'].replace("'first-primary'", "'first-unconstrained'"); },
        input => { input.foundation.batch_contract.exact_audit_statements = 2; },
        input => { input.foundation.read_contract.maximum_page_size = 101; }
    ];
    for (const mutate of cases) {
        assertRejects(mutate);
    }
});

test('CF-P2-004 rejects API reachability, remote binding, activation, and evidence drift', () => {
    const cases = [
        input => { input.apiSources.shell += "\nimport './persistence/index';"; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        // D-P7-01 authorizes COLLABORATION_ENABLED = 'true' for PREVIEW ONLY. Production
        // must still be rejected, so this case stays targeted at production.
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        // D-P7-01 leaves the top-level `vars` default disabled too; prove it is rejected.
        input => { input.wrangler.vars.COLLABORATION_ENABLED = 'true'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-004']; }
    ];
    for (const mutate of cases) {
        assertRejects(mutate);
    }
});
