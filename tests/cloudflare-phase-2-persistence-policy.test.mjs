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

test('CF-P2-004 locks typed, checked, bounded, atomic, and API-isolated persistence', () => {
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
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2PersistenceFoundation(input));
    }
});

test('CF-P2-004 rejects API reachability, remote binding, activation, and evidence drift', () => {
    const cases = [
        input => { input.apiSources.shell += "\nimport './persistence/index';"; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-004']; }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2PersistenceFoundation(input));
    }
});
