import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase3ContractFreeze } from '../scripts/cloudflare-phase-3-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-3');
    return {
        manifest: json('config/cloudflare/phase-3-contract-freeze.json'),
        sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
        evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P3-(STA|SEC)-001\.md$/.test(name))
            .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
        wrangler: json('wrangler.jsonc'), branchControl: json('config/cloudflare/pages-branch-control.json'),
        migrationManifest: json('migrations/manifest.json'), wranglerSchema: json('node_modules/wrangler/config-schema.json'),
        gitignore: read('.gitignore'), operationalRunbook: read('docs/collaboration-foundation/operational-runbook.md')
    };
}

test('CF-P3-001 freezes OAuth, session, CSRF, rate, environment, and disclosure contracts', () => {
    assert.equal(validatePhase3ContractFreeze(actualInput()), true);
});

test('CF-P3-001 rejects runtime, schema, remote, production, route, and identity activation drift', () => {
    for (const mutate of [
        input => { input.manifest.scope.runtime_code_changes = 1; },
        input => { input.manifest.scope.remote_writes = 1; },
        input => { input.migrationManifest.entries.push({ tables: ['auth_rate_windows'] }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.manifest.route_contract.push({ method: 'POST', path: '/api/v1/workspaces', cache: 'no-store-private' }); }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3ContractFreeze(input));
    }
});

test('CF-P3-001 rejects weaker crypto, callback, cookie, CSRF, rate, evidence, and gate contracts', () => {
    for (const mutate of [
        input => { input.manifest.oauth_contract.pkce.method = 'plain'; },
        input => { input.manifest.oauth_contract.callback_atomic_batch.pop(); },
        input => { input.manifest.session_contract.cookie_attributes = ['Secure']; },
        input => { input.manifest.session_contract.csrf.d1_storage = 'plaintext'; },
        input => { input.manifest.rate_limit_contract.authoritative_oauth_window.period_seconds = 60; },
        input => { delete input.evidenceSources['CF-EV-P3-SEC-001']; },
        input => { input.manifest.next_decision.remote_changes_authorized = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3ContractFreeze(input));
    }
});
