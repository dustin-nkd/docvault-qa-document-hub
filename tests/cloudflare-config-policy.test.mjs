import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPagesSnapshot, validatePagesSnapshotDocument } from '../scripts/cloudflare-config-policy.mjs';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = readPagesSnapshot(path.join(root, 'config/cloudflare/pages-project-baseline.json'));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('sanitized Cloudflare Pages baseline locks project, branch, output, source, and empty bindings', () => {
    assert.equal(validatePagesSnapshotDocument(baseline, baseline), true);
    assert.equal(baseline.snapshot.project_name, 'docvault-qa-document-hub');
    assert.equal(baseline.snapshot.production_branch, 'main');
    assert.equal(baseline.snapshot.build_config.destination_dir, '_site');
    assert.deepEqual(baseline.snapshot.environments.production.d1_binding_names, []);
});

test('Cloudflare Pages policy blocks project, output, source, and binding drift', () => {
    for (const mutate of [
        (value) => { value.snapshot.project_name = 'wrong-project'; },
        (value) => { value.snapshot.build_config.destination_dir = 'dist'; },
        (value) => { value.snapshot.deployment_source.repository = 'wrong-repository'; },
        (value) => { value.snapshot.environments.production.d1_binding_names.push('COLLAB_DB'); }
    ]) {
        const candidate = clone(baseline);
        mutate(candidate);
        assert.throws(() => validatePagesSnapshotDocument(candidate, baseline));
    }
});

test('Cloudflare Pages drift comparison blocks an unexpected binding deletion', () => {
    const expected = clone(baseline);
    expected.snapshot.environments.preview.d1_binding_names = ['COLLAB_DB'];
    const candidate = clone(expected);
    candidate.snapshot.environments.preview.d1_binding_names = [];
    assert.throws(
        () => validatePagesSnapshotDocument(candidate, expected),
        /configuration drift detected.*d1_binding_names/
    );
});

test('Cloudflare Pages snapshot rejects resource identifiers and secret-shaped fields', () => {
    for (const [key, value] of [
        ['account_id', 'not-allowed'],
        ['database_id', '11111111-1111-4111-8111-111111111111'],
        ['client_secret', 'not-allowed'],
        ['session_secret', 'not-allowed']
    ]) {
        const candidate = clone(baseline);
        candidate.snapshot[key] = value;
        assert.throws(() => validatePagesSnapshotDocument(candidate), /keys changed|prohibited/);
    }
});

test('Cloudflare Pages branch control excludes only the generated GitHub Pages artifact branch', () => {
    const control = JSON.parse(fs.readFileSync(path.join(root, 'config/cloudflare/pages-branch-control.json'), 'utf8'));
    assert.deepEqual(control, {
        schema_version: 1,
        project_name: 'docvault-qa-document-hub',
        production_branch: 'main',
        production_deployments_enabled: true,
        preview_deployment_setting: 'custom',
        preview_branch_includes: ['*'],
        preview_branch_excludes: ['gh-pages']
    });
});
