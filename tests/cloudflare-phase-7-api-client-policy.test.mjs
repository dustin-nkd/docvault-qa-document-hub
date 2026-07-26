// Drift tests for the CF-P7-015 gate. Each case breaks one thing and asserts
// the policy rejects it, so the gate is known to bite rather than assumed to.
//
// Source mutations assert that the replacement actually changed the text before
// asserting the policy rejects it. Git renormalises line endings on checkout, so
// a pattern written with \n can silently fail to match on a CRLF working copy —
// leaving a test that passes while checking nothing at all.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    validatePhase7ApiClient, code, importClosure, PERSONAL_KEYS, PROHIBITED_QUERY_KEYS,
    CAPABILITY_QUERY_KEYS, TRANSPORT_PATTERN
} from '../scripts/cloudflare-phase-7-api-client-policy.mjs';
import * as apiClient from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const collaborationDir = path.join(root, 'js', 'collaboration');
const collaborationSources = () => Object.fromEntries(
    fs.readdirSync(collaborationDir)
        .filter(name => name.endsWith('.js'))
        .sort()
        .map(name => [`js/collaboration/${name}`, read(`js/collaboration/${name}`)])
);

const input = () => ({
    manifest: json('config/cloudflare/phase-7-api-client.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    clientSource: read('js/collaboration/api-client.js'),
    entrySource: read('js/collaboration/entry.js'),
    deploymentSource: read('js/deployment.js'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    collaborationSources: collaborationSources(),
    unitTestSource: read('tests/collaboration-api-client.test.mjs'),
    clientExports: { ...apiClient }
});

/** Replace and prove the replacement landed, so a no-op mutation cannot pass. */
const mutated = (source, pattern, replacement) => {
    const result = source.replace(pattern, replacement);
    assert.notEqual(result, source, `mutation did not apply: ${pattern}`);
    return result;
};

test('the policy accepts the repository as it stands', async () => {
    assert.equal(await validatePhase7ApiClient(input()), true);
});

// ── the frozen error taxonomy ────────────────────────────────────────────────

test('handling a code the contract never froze is rejected', async () => {
    const drifted = input();
    drifted.clientExports.TAXONOMY_CODES = [...apiClient.TAXONOMY_CODES, 'TEAPOT'];
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /drifted from the frozen taxonomy/);
});

test('dropping a frozen code is rejected', async () => {
    const drifted = input();
    drifted.clientExports.TAXONOMY_CODES = apiClient.TAXONOMY_CODES.slice(1);
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /drifted from the frozen taxonomy/);
});

test('presenting a frozen code as the wrong state is rejected', async () => {
    const drifted = input();
    drifted.clientExports.presentErrorCode = codeValue => (
        codeValue === 'DOCUMENT_REVISION_CONFLICT'
            ? { code: codeValue, ui: 'error', reason: 'x'.repeat(30), recognised: true }
            : apiClient.presentErrorCode(codeValue));
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /the contract froze Conflict/);
});

test('a role denial flattened into a generic error is rejected', async () => {
    const drifted = input();
    drifted.clientExports.presentErrorCode = codeValue => (
        codeValue === 'OPERATION_NOT_PERMITTED'
            ? { code: codeValue, ui: 'error', reason: 'x'.repeat(30), recognised: true }
            : apiClient.presentErrorCode(codeValue));
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /the contract froze role-disabled-explanation/);
});

test('a presentation with no reason in text is rejected', async () => {
    const drifted = input();
    drifted.clientExports.presentErrorCode = codeValue => ({
        ...apiClient.presentErrorCode(codeValue), reason: 'no'
    });
    await assert.rejects(() => validatePhase7ApiClient(drifted), /without explaining itself/);
});

test('an unknown code passed through instead of failing closed is rejected', async () => {
    const drifted = input();
    drifted.clientExports.presentErrorCode = codeValue => (
        apiClient.TAXONOMY_CODES.includes(codeValue)
            ? apiClient.presentErrorCode(codeValue)
            : { code: codeValue, ui: 'error', reason: 'x'.repeat(30), recognised: true });
    await assert.rejects(() => validatePhase7ApiClient(drifted), /no longer fails closed/);
});

test('echoing an unknown server code back into the interface is rejected', async () => {
    const drifted = input();
    drifted.clientExports.presentErrorCode = codeValue => (
        apiClient.TAXONOMY_CODES.includes(codeValue)
            ? apiClient.presentErrorCode(codeValue)
            : { code: 'UNRECOGNISED', ui: 'error', reason: `Failed: ${codeValue}`, recognised: false }
    );
    await assert.rejects(() => validatePhase7ApiClient(drifted), /echoed back into the interface/);
});

test('an alias resolving outside the frozen taxonomy is rejected', async () => {
    const drifted = input();
    drifted.clientExports.SERVER_CODE_ALIASES = {
        ...apiClient.SERVER_CODE_ALIASES, AUTHENTICATION_REQUIRED: 'SOMETHING_ELSE'
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /resolves outside the frozen taxonomy/);
});

test('an undeclared alias is rejected', async () => {
    const drifted = input();
    drifted.clientExports.SERVER_CODE_ALIASES = {
        ...apiClient.SERVER_CODE_ALIASES, SOME_NEW_SERVER_CODE: 'RATE_LIMITED'
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted), /alias set drifted/);
});

test('a contract whose taxonomy shrinks is rejected', async () => {
    const drifted = input();
    drifted.contract = clone(drifted.contract);
    drifted.contract.error_mapping = drifted.contract.error_mapping.slice(0, 11);
    await assert.rejects(() => validatePhase7ApiClient(drifted), /no longer twelve codes/);
});

// ── same-origin and CSRF ─────────────────────────────────────────────────────

test('a client that sends cross-origin is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return { ...real, request: async args => real.request({ ...args, path: '/api/v1/session' }) };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /cross-origin path is no longer refused/);
});

test('a client that handed the CSRF token back out is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return {
            ...real,
            resolveSession: async () => ({
                ...await real.resolveSession(), csrfToken: 'csrf-token-value'
            })
        };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted), /handed back out of the client/);
});

test('a mutation sent before the session is resolved is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return { ...real, mutate: async () => ({ ok: true, status: 201, data: null }) };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /before the session is resolved is no longer refused/);
});

test('a client that builds without any transport is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => apiClient.createApiClient({
        ...options, fetch: options?.fetch ?? (async () => ({ ok: true, status: 204 }))
    });
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /no usable transport is no longer refused/);
});

// ── idempotency ──────────────────────────────────────────────────────────────

/**
 * A client whose transport quietly loses one header on the way out.
 *
 * A non-function transport is passed through untouched, so the policy's own
 * "no usable transport" case still reaches the refusal it is testing rather
 * than being handed a wrapper that is always callable.
 */
const clientDropping = header => options => apiClient.createApiClient({
    ...options,
    fetch: typeof options?.fetch === 'function'
        ? (url, init) => {
            const headers = { ...init.headers };
            delete headers[header];
            return options.fetch(url, { ...init, headers });
        }
        : options?.fetch
});

test('a mutation that reaches the wire without an idempotency key is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = clientDropping('Idempotency-Key');
    await assert.rejects(() => validatePhase7ApiClient(drifted), /carries no Idempotency-Key/);
});

test('a mutation that reaches the wire without a CSRF token is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = clientDropping('X-CSRF-Token');
    await assert.rejects(() => validatePhase7ApiClient(drifted), /carries no CSRF token/);
});

test('a replayed key silently regenerated is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return {
            ...real,
            mutate: async args => real.mutate({ ...args, idempotencyKey: null })
        };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /no longer reuses its original key/);
});

test('a read allowed to carry an idempotency key is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return {
            ...real,
            request: async args => real.request({ ...args, idempotencyKey: null })
        };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /read carrying an idempotency key is no longer refused/);
});

test('a weak idempotency key accepted is rejected', async () => {
    const drifted = input();
    drifted.clientExports.assertIdempotencyKey = key => key;
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /cannot carry the required entropy/);
});

// ── cursors and pagination ───────────────────────────────────────────────────

test('a cursor that is rewritten rather than passed through is rejected', async () => {
    const drifted = input();
    drifted.clientExports.buildQuery = args => apiClient.buildQuery({
        ...args, cursor: args?.cursor ? `${args.cursor}x` : args?.cursor
    });
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /no longer passed through unchanged/);
});

test('offset pagination accepted is rejected', async () => {
    for (const key of PROHIBITED_QUERY_KEYS) {
        const drifted = input();
        drifted.clientExports.buildQuery = args => {
            const filters = { ...(args?.filters ?? {}) };
            delete filters[key];
            return apiClient.buildQuery({ ...args, filters });
        };
        await assert.rejects(() => validatePhase7ApiClient(drifted),
            new RegExp(`Offset pagination via ${key} is no longer refused`), key);
    }
});

test('a capability allowed into the query string is rejected', async () => {
    for (const key of CAPABILITY_QUERY_KEYS) {
        const drifted = input();
        drifted.clientExports.buildQuery = args => {
            const filters = { ...(args?.filters ?? {}) };
            delete filters[key];
            return apiClient.buildQuery({ ...args, filters });
        };
        await assert.rejects(() => validatePhase7ApiClient(drifted),
            new RegExp(`capability may now be put in the query string: ${key}`), key);
    }
});

test('an unbounded page size is rejected', async () => {
    const drifted = input();
    drifted.clientExports.buildQuery = args => apiClient.buildQuery({ ...args, limit: undefined });
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /beyond the contract maximum is no longer refused/);
});

test('a list that drops the server cursor is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return { ...real, list: async args => ({ ...await real.list(args), nextCursor: null }) };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /no longer returned to the caller unchanged/);
});

// ── availability, the owner's boundary decision ──────────────────────────────

test('a client that ignores a disabled deployment is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return {
            ...real,
            resolveSession: async () => ({ ...await real.resolveSession(), available: true })
        };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted), /is no longer believed/);
});

test('an authentication failure reported as an unavailable deployment is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return {
            ...real,
            resolveSession: async () => {
                const resolved = await real.resolveSession();
                return resolved.failure === null ? resolved : { ...resolved, available: false };
            }
        };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /now reported as an unavailable deployment/);
});

test('an app-shell response read as data is rejected', async () => {
    const drifted = input();
    drifted.clientExports.createApiClient = options => {
        const real = apiClient.createApiClient(options);
        return {
            ...real,
            resolveSession: async () => {
                const resolved = await real.resolveSession();
                return resolved.reason === 'transport-failed'
                    ? { ...resolved, failure: null } : resolved;
            }
        };
    };
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /secretly the app shell is no longer refused/);
});

test('a probe added to the eager module is rejected', async () => {
    const drifted = input();
    drifted.deploymentSource += '\nfetch("/api/v1/session");\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /probe on Personal startup/);
});

test('reaching for the ambient global in the eager module is rejected', async () => {
    const drifted = input();
    drifted.deploymentSource += '\nconst probe = globalThis.fetch;\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /probe on Personal startup/);
});

test('an opener that bypasses the deployment question is rejected', async () => {
    const drifted = input();
    drifted.deploymentSource = mutated(drifted.deploymentSource,
        /module\.startCollaboration\(/, 'module.openCollaboration(');
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /no longer reaches the entry that asks/);
});

test('dropping the owner authorization for the boundary decision is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.availability.authorized_by = 'implementer';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /no owner authorization/);
});

test('reverting to hostname-only availability is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.availability.decided_by = 'hostname';
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /availability decision drifted/);
});

test('claiming the probe runs on Personal startup is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.availability.probe_on_personal_startup = true;
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /probe may now run on Personal startup/);
});

// ── the single transport seam ────────────────────────────────────────────────

test('a second module performing transport is rejected', async () => {
    const drifted = input();
    drifted.collaborationSources['js/collaboration/member-list.js'] += '\nfetch("/api/v1/x");\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /Transport must live in exactly one module/);
});

test('a second module reaching for the ambient global is rejected', async () => {
    const drifted = input();
    drifted.collaborationSources['js/collaboration/audit-activity.js']
        += '\nconst send = globalThis.fetch;\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /Transport must live in exactly one module/);
});

test('the client losing its transport entirely is rejected', async () => {
    const drifted = input();
    drifted.collaborationSources['js/collaboration/api-client.js'] = mutated(
        drifted.collaborationSources['js/collaboration/api-client.js'],
        /globalThis\.fetch\?\.bind\(globalThis\)/, 'undefined');
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /Transport must live in exactly one module/);
});

test('the transport pattern catches a call and a reference but not a property', () => {
    assert.equal(TRANSPORT_PATTERN.test('fetch("/x")'), true);
    assert.equal(TRANSPORT_PATTERN.test('const f = globalThis.fetch;'), true);
    assert.equal(TRANSPORT_PATTERN.test('window.fetch;'), true);
    // An injected transport named by its parameter is not a second door.
    assert.equal(TRANSPORT_PATTERN.test('createApiClient({ fetch: transport })'), false);
    assert.equal(TRANSPORT_PATTERN.test('client.prefetch(1)'), false);
});

test('transport in a comment passes; transport in code fails', async () => {
    const documented = input();
    documented.entrySource += '\n// this module never calls fetch( or globalThis.fetch\n';
    assert.equal(await validatePhase7ApiClient(documented), true);
    assert.equal(code('const a = 1; // fetch(x)').includes('fetch(x)'), false);
});

// ── isolation and bookkeeping ────────────────────────────────────────────────

test('the client reaching for personal storage is rejected', async () => {
    for (const key of PERSONAL_KEYS) {
        const drifted = input();
        drifted.clientSource += `\nconst leak = localStorage.getItem('${key}');\n`;
        await assert.rejects(() => validatePhase7ApiClient(drifted),
            new RegExp(`API client reached for ${key}`), key);
    }
});

test('the entry reaching for personal storage is rejected', async () => {
    const drifted = input();
    drifted.entrySource += '\nconst leak = localStorage.getItem("docvault_docs");\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /entry reached for docvault_docs/);
});

test('rendering through innerHTML is rejected', async () => {
    const drifted = input();
    drifted.clientSource += '\nnode.innerHTML = data.title;\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /innerHTML/);
});

test('a collaboration module entering the service worker precache is rejected', async () => {
    const drifted = input();
    drifted.serviceWorker += '\nPRECACHE.push("/js/collaboration/api-client.js");\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /service worker precache/);
});

test('an eager script tag for a collaboration module is rejected', async () => {
    const drifted = input();
    drifted.indexHtml += '\n<script src="js/collaboration/api-client.js"></script>\n';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /eager script tag/);
});

test('claiming a surface of its own is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.surfaces = ['api-client'];
    await assert.rejects(() => validatePhase7ApiClient(drifted), /claims a surface of its own/);
});

test('claiming to add a primitive is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.adds_primitive = true;
    await assert.rejects(() => validatePhase7ApiClient(drifted), /add a primitive/);
});

test('a manifest that authorizes the wrong next story is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-014';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    await assert.rejects(() => validatePhase7ApiClient(drifted), /Unit test inventory drifted/);
});

// ── no silent caps ───────────────────────────────────────────────────────────

test('a surface dropped from both coverage lists is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    const limits = drifted.manifest.declared_limits;
    // A surface in neither list is coverage claimed and not delivered, which is
    // the failure this rule exists to stop. Dropped from the reachable list now
    // that the pending one is closed and empty.
    assert.ok(limits.surfaces_reachable_from_entry.length > 0);
    limits.surfaces_reachable_from_entry = limits.surfaces_reachable_from_entry.slice(1);
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /does not account for every frozen surface/);
});

test('claiming a surface is reachable while it is also pending is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.surfaces_reachable_from_entry.push('audit-activity');
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /does not account for every frozen surface/);
});

test('a limit emptied with nothing recorded as closing it is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    // A limit somebody quietly deleted and a limit some story honoured look
    // identical in a file unless the second one is named.
    delete drifted.manifest.declared_limits.closed_by;
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /nothing recorded as closing it/);
});

test('claiming a surface is reachable that nothing the entry imports renders is rejected',
    async () => {
        const drifted = input();
        drifted.manifest = clone(drifted.manifest);
        // The entry no longer imports the panel, so eight of the ten surfaces
        // stop being reachable — but the manifest still says they are.
        drifted.collaborationSources['js/collaboration/entry.js'] = mutated(
            drifted.collaborationSources['js/collaboration/entry.js'],
            /import\s*\{\s*renderSurfacePanel\s*\}\s*from\s*'\.\/surface-panel\.js';/,
            'const renderSurfacePanel = () => null;');
        await assert.rejects(() => validatePhase7ApiClient(drifted),
            /declared reachable from the entry but nothing it imports renders it/);
    });

test('claiming a surface is still pending after the entry reaches it is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    const limits = drifted.manifest.declared_limits;
    limits.surfaces_reachable_from_entry = limits.surfaces_reachable_from_entry
        .filter(surface => surface !== 'audit-activity');
    limits.surfaces_not_yet_composed = ['audit-activity'];
    await assert.rejects(() => validatePhase7ApiClient(drifted),
        /declared not yet composed, but the entry already reaches it/);
});

test('the import closure follows the entry rather than the directory', () => {
    const sources = collaborationSources();
    const closure = importClosure(sources, 'js/collaboration/entry.js');
    assert.ok(closure.has('js/collaboration/entry.js'));
    assert.ok(closure.has('js/collaboration/surface-panel.js'),
        'the panel the entry imports is missing from its own closure');
    assert.ok(closure.has('js/collaboration/audit-activity.js'),
        'the closure stopped at the first hop instead of following transitively');
    // A module nothing imports is not in the graph, which is the whole point:
    // walking the directory would have called every surface reachable.
    assert.equal(closure.has('js/collaboration/storage-provider.js'), false);
});

test('a narrowed coverage with no reason is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.reason = 'later';
    await assert.rejects(() => validatePhase7ApiClient(drifted), /carries no reason/);
});

test('the declared limit is stated at run time, not only in the manifest', () => {
    const check = read('scripts/check-cloudflare-phase-7-api-client.mjs');
    assert.match(check, /DECLARED LIMIT/);
    assert.match(check, /surfaces_not_yet_composed/);
    assert.match(check, /DECLARED LIMIT CLOSED/);
});

test('dropping the single-transport-seam claim is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.isolation.single_transport_seam = false;
    await assert.rejects(() => validatePhase7ApiClient(drifted), /single-transport-seam/);
});
