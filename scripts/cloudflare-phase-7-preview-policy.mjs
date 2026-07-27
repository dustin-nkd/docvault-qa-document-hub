// CF-P7-013 — the composed collaboration UI, and its Preview qualification.
//
// This gate has two halves because the story has two halves, and only one of
// them can be re-run in CI.
//
// The composition is **driven**, not read. Every assertion below about which
// surfaces mount, what a denied read becomes, and which routes are called comes
// from running the shipped entry against a recording transport and a minimal
// document. A gate that grepped for `renderSurfacePanel` would have passed on
// the state this story found: every surface composed, every one of them stuck on
// `loading`, because nothing joined the client to the panel.
//
// The Preview measurements cannot be re-run — they belong to one deployment at
// one moment — so they are validated as a record, in the Phase 6 pattern. What
// this gate refuses is the one dishonest combination: a PASS claimed without the
// journeys having been qualified against an enabled deployment.

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** Personal Vault storage. A collaboration path that touches these breaks U1. */
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

const OWNER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const INVITATION = '66666666-6666-4666-8666-666666666666';
const EVENT = '99999999-9999-4999-8999-999999999999';

// ── a document small enough for a gate to own ────────────────────────────────

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        id: '', hidden: false, disabled: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        append(...nodes) { this.children.push(...nodes); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
        addEventListener() {},
        focus() {},
        querySelector(selector) { return descendants(this).find(matches(selector)) ?? null; },
        querySelectorAll(selector) { return descendants(this).filter(matches(selector)); }
    };
    return node;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const matches = selector => node => {
    if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
        const value = node.getAttribute(attribute[1]);
        return attribute[2] === undefined ? value !== null : value === attribute[2];
    }
    return node.tagName === selector;
};

function documentWithRoot() {
    const container = element('div');
    container.id = 'collaboration-root';
    container.hidden = true;
    return {
        createElement: element,
        getElementById: id => (id === 'collaboration-root' ? container : null),
        container
    };
}

const textOf = node => {
    const walk = current => [current.textContent ?? '', ...(current.children ?? []).flatMap(walk)];
    return walk(node).join(' ');
};

// ── a deployment that answers by route ───────────────────────────────────────

const respond = (status, body, contentType = 'application/json; charset=utf-8') => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body
});

const okPage = items => respond(200, { data: { items }, meta: { page: { nextCursor: null } } });

const ROUTES = Object.freeze({
    session: '/api/v1/session',
    workspaces: '/api/v1/workspaces',
    members: `/api/v1/workspaces/${WORKSPACE}/members`,
    invitations: `/api/v1/workspaces/${WORKSPACE}/invitations`,
    audit: `/api/v1/workspaces/${WORKSPACE}/audit-events`,
    envelope: `/api/v1/workspaces/${WORKSPACE}/key-envelopes/current`,
    bootstrap: '/api/v1/invitations/bootstrap'
});

const deployment = (overrides = {}) => ({
    // /api/v1/session answers with its fields directly at the top level, not
    // the {data, meta} envelope every other route below uses --
    // functions/_lib/identity/runtime-handler.ts predates that convention.
    // This gate drove the composed UI against the wrong (enveloped) shape
    // until a real, live authenticated session exposed it: resolveSession()
    // read a nonexistent .data and reported authenticated: false regardless of
    // what the deployment actually said, so this simulated deployment was
    // silently exercising the signed-out path even where it claimed to
    // exercise the signed-in one.
    [ROUTES.session]: respond(200, {
        authenticated: true,
        user: { userId: OWNER, login: 'dustin-nkd' },
        session: {},
        csrfToken: 'csrf'
    }),
    [ROUTES.workspaces]: okPage([{
        workspaceId: WORKSPACE, displayName: 'Platform QA', role: 'owner',
        keyReadiness: 'key_ready'
    }]),
    [ROUTES.members]: okPage([{
        userId: OWNER, role: 'owner', state: 'active', keyReadiness: 'key_ready',
        displayProfile: { login: 'dustin-nkd' }
    }]),
    [ROUTES.invitations]: okPage([{
        invitationId: INVITATION, targetDisplayLogin: 'octocat', role: 'editor',
        state: 'pending', expiresAt: '2026-07-29T00:00:00.000Z'
    }]),
    [ROUTES.audit]: okPage([{
        eventId: EVENT, eventType: 'workspace.created', outcome: 'success',
        occurredAt: '2026-07-26T00:00:00.000Z'
    }]),
    [ROUTES.envelope]: respond(200, {
        data: { readiness: 'key_ready', envelope: {} }, meta: {}
    }),
    ...overrides
});

function recordingClient(createApiClient, routes) {
    const seen = [];
    const client = createApiClient({
        fetch: async url => {
            const pathname = String(url).split('?')[0];
            seen.push(pathname);
            const answer = routes[pathname];
            if (answer === undefined) {
                return respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} });
            }
            return typeof answer === 'function' ? answer(seen) : answer;
        },
        randomId: () => 'a'.repeat(36)
    });
    return { client, seen };
}

const rememberingStore = (touched = []) => ({
    getItem(key) {
        touched.push(key);
        return key.endsWith(':active-workspace') ? WORKSPACE : null;
    },
    setItem(key) { touched.push(key); },
    removeItem(key) { touched.push(key); }
});

/** Run the shipped entry against one deployment and report what it rendered. */
async function drive({ entry, createApiClient, routes, storage, location, history }) {
    const doc = documentWithRoot();
    const { client, seen } = recordingClient(createApiClient, routes);
    await entry.startCollaboration({
        document: doc,
        deployment: { available: true, reason: 'cloudflare-deployment' },
        client,
        storage: storage ?? rememberingStore(),
        environment: 'preview',
        location,
        history
    });
    const sections = doc.container.querySelectorAll('[data-surface]');
    return {
        doc,
        seen,
        text: textOf(doc.container),
        surfaces: sections.map(node => node.getAttribute('data-surface')),
        states: Object.fromEntries(sections.map(node => [
            node.getAttribute('data-surface'),
            node.children[0]?.getAttribute('data-collab-state') ?? 'rendered'
        ]))
    };
}

const refusal = async run => {
    try {
        await run();
        return null;
    } catch (error) {
        return error?.code ?? 'THREW_WITHOUT_CODE';
    }
};

export async function validatePhase7Preview({ manifest, contract, apiContract, entry, services,
    apiClient, panelSource, entrySource, deploymentSource, evidence }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-013' && manifest.approved_entry_gate === 'P7-G4'
        && manifest.next_gate === 'P7-G4A' && manifest.authorizes_on_approval === 'CF-P7-014',
    'Unsupported Phase 7 Preview integration manifest');
    assert(manifest.environment === 'preview',
        'CF-P7-013 may only qualify against Preview');

    // ── the frozen twelve are all accounted for ──────────────────────────────
    const composition = manifest.composition || {};
    const claimed = [
        ...(composition.surfaces_in_chrome || []),
        ...(composition.surfaces_in_panel || []),
        ...(composition.shared_surfaces || [])
    ];
    const frozen = (contract.surfaces || []).map(surface => surface.id);
    assert(frozen.length === 12, 'The frozen surface inventory is no longer twelve');
    assert(same(claimed, frozen),
        'The composition does not account for every frozen surface');
    assert(composition.adds_primitive === false && composition.reimplements_service === false,
        'The composition claims to add a primitive or reimplement a service');

    // ── the composition is driven, not read ─────────────────────────────────
    const healthy = await drive({
        entry, createApiClient: apiClient.createApiClient, routes: deployment()
    });

    for (const surface of composition.surfaces_in_panel) {
        assert(healthy.surfaces.includes(surface),
            `A composed surface never mounted: ${surface}`);
    }

    // The defect this story exists to remove. A surface that says it is loading
    // and never stops is worse than one that says it failed, because the user
    // has no reason to stop waiting.
    const stuck = Object.entries(healthy.states)
        .filter(([, state]) => state === 'loading')
        .map(([surface]) => surface);
    assert(stuck.length === 0,
        `Surfaces left on loading after every read returned: ${stuck.join(', ')}`);
    assert(manifest.budgets?.surfaces_left_on_loading_after_reads === 0,
        'The no-permanent-loading budget was dropped');

    // Filled from the deployment rather than from defaults: a panel that renders
    // its own placeholders would satisfy every assertion above.
    assert(/dustin-nkd/.test(healthy.text), 'The member read never reached the surface');
    assert(/workspace\.created/.test(healthy.text), 'The audit read never reached the surface');
    assert(/octocat/.test(healthy.text), 'The invitation read never reached the surface');

    // Every route the manifest claims is exercised, and no route it does not.
    const called = [...new Set(healthy.seen)].map(path => path.replace(WORKSPACE, '{workspaceId}'));
    const declared = composition.routes_exercised || [];
    for (const path of called) {
        assert(declared.includes(path), `A route was called that the manifest does not declare: ${path}`);
    }
    for (const path of declared) {
        assert(apiContract.includes(path.replace('{workspaceId}', '{workspaceId}')),
            `A declared route is not in the frozen catalog: ${path}`);
    }

    // ── one refused read is a fact about one surface ─────────────────────────
    const denied = await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment({
            [ROUTES.members]: respond(403, {
                error: { code: 'OPERATION_NOT_PERMITTED' }, meta: {}
            })
        })
    });
    assert(denied.states['member-list-role-badge'] === 'error',
        'A read that came back refused does not become that surface\'s error');
    assert(/workspace\.created/.test(denied.text),
        'One refused read took a neighbouring surface down with it');

    // An unrecognised code fails closed and is never shown to a person.
    const unknown = await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment({
            [ROUTES.members]: respond(500, {
                error: { code: 'A_CODE_NOBODY_FROZE' }, meta: {}
            })
        })
    });
    assert(!unknown.text.includes('A_CODE_NOBODY_FROZE'),
        'An unrecognised server code is echoed into the interface');

    // ── Access removed may only follow a membership re-check ─────────────────
    let listed = 0;
    const removed = await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment({
            [ROUTES.workspaces]: () => {
                listed += 1;
                return okPage(listed === 1 ? [{
                    workspaceId: WORKSPACE, displayName: 'Platform QA', role: 'owner',
                    keyReadiness: 'key_ready'
                }] : []);
            },
            [ROUTES.members]: respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} })
        })
    });
    assert(listed >= 2, 'The membership re-check never ran');
    const removedSync = removed.doc.container
        .querySelector('[data-collab-surface="sync-state"]');
    assert(removedSync?.getAttribute('data-sync-state') === 'access-removed',
        'A removed membership no longer resolves to the Access removed state');

    // The same denial with the membership intact must NOT claim it. The API
    // returns the same non-disclosing code either way, so inferring removal from
    // the code alone would confirm the resource's existence.
    const present = await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment({
            [ROUTES.members]: respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} })
        })
    });
    const presentSync = present.doc.container
        .querySelector('[data-collab-surface="sync-state"]');
    assert(presentSync?.getAttribute('data-sync-state') !== 'access-removed',
        'A denial alone now claims Access removed, which discloses the resource');

    // ── nothing is asked that the role may not ask ───────────────────────────
    const editor = await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment({
            [ROUTES.workspaces]: okPage([{
                workspaceId: WORKSPACE, displayName: 'Platform QA', role: 'editor',
                keyReadiness: 'key_ready'
            }])
        })
    });
    assert(!editor.seen.includes(ROUTES.audit),
        'An editor is now asked for a read their role forbids');
    assert(/Only an owner or admin/.test(editor.text),
        'The role-disabled explanation was replaced by a generic denial');

    // ── the invitation token stays out of every URL ──────────────────────────
    const token = 'z'.repeat(48);
    const replaced = [];
    const invited = await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment({
            [ROUTES.bootstrap]: respond(200, {
                data: {
                    invitationId: INVITATION, workspaceDisplayName: 'Platform QA',
                    targetDisplayLogin: 'dustin-nkd', role: 'editor',
                    expiresAt: '2026-07-29T00:00:00.000Z', state: 'pending'
                },
                meta: {}
            })
        }),
        location: { hash: `#/invite/${token}`, pathname: '/', search: '' },
        history: { replaceState: (state, title, url) => replaced.push(url) }
    });
    assert(invited.seen.includes(ROUTES.bootstrap), 'An invitation link is never reviewed');
    assert(!invited.seen.some(path => path.includes(token)),
        'The invitation token reached a URL');
    assert(replaced.length === 1 && !String(replaced[0]).includes(token),
        'The address bar was not cleared by replacement');

    // ── the personal boundary ────────────────────────────────────────────────
    const touched = [];
    await drive({
        entry,
        createApiClient: apiClient.createApiClient,
        routes: deployment(),
        storage: rememberingStore(touched)
    });
    for (const key of PERSONAL_KEYS) {
        assert(!touched.includes(key), `A collaboration path reached for ${key}`);
    }
    assert(manifest.budgets?.personal_storage_keys_touched === 0,
        'The personal-storage budget was dropped');
    assert(manifest.budgets?.collaboration_modules_on_personal_startup === 0,
        'The zero-modules-on-startup budget was dropped');
    assert(!/<script/.test(panelSource) && !/\.innerHTML/.test(panelSource),
        'The panel renders through innerHTML');
    assert(/import\('\.\/collaboration\/entry\.js'\)/.test(deploymentSource),
        'The eager module no longer reaches the entry through a dynamic import');

    // The entry must hand the store, the environment, and the address bar in.
    // Without them a returning user's workspace is never restored and an
    // invitation link is a fragment nothing reads — two surfaces that render
    // perfectly and stay empty forever.
    for (const argument of ['storage:', 'environment:', 'location:', 'history:']) {
        assert(deploymentSource.includes(argument),
            `The opener no longer hands the entry ${argument}`);
    }

    // ── the adapter refuses what the client cannot see ───────────────────────
    const built = services.buildPath('/workspaces/{workspaceId}/members',
        { workspaceId: WORKSPACE });
    assert(built === `/api/v1/workspaces/${WORKSPACE}/members`, 'The adapter route shape drifted');
    for (const hostile of ['../../admin', 'ws_1', '']) {
        assert(await refusal(async () =>
            services.buildPath('/workspaces/{workspaceId}/members', { workspaceId: hostile }))
            === 'PATH_SEGMENT_INVALID',
        `An identifier the server would never issue reached a URL: ${hostile}`);
    }
    assert(composition.single_transport_seam === true,
        'The single-transport-seam claim was dropped');
    assert(!/(^|[^\w.])fetch\s*\(|\bglobalThis\.fetch\b/.test(entrySource),
        'The entry performs its own transport instead of using the client');

    // ── no silent caps ───────────────────────────────────────────────────────
    const limits = manifest.declared_limits || {};
    const journeys = limits.journeys_not_completable_in_this_build || [];
    assert(journeys.length > 0, 'A limit is declared with nothing in it');
    for (const limit of journeys) {
        assert(typeof limit.journey === 'string' && limit.journey.length > 0,
            'A declared limit does not name its journey');
        assert(typeof limit.missing === 'string' && limit.missing.length > 10,
            `The limit on ${limit.journey} does not say what is missing`);
        assert(typeof limit.reason === 'string' && limit.reason.length > 120,
            `The limit on ${limit.journey} carries no substantive reason`);
        assert(frozen.includes(limit.surface),
            `A limit names a surface the contract never froze: ${limit.surface}`);
    }
    const reachable = limits.sync_states_reachable || [];
    const unreachable = limits.sync_states_not_reachable || [];
    assert(same([...reachable, ...unreachable],
        ['saved', 'saving', 'offline', 'conflict', 'access-removed']),
    'The sync-state coverage split does not account for all five states');
    assert(typeof limits.sync_reason === 'string' && limits.sync_reason.length > 120,
        'The narrowed sync-state coverage carries no reason');

    // ── the Preview record, and the one dishonest combination ────────────────
    const preview = manifest.preview || {};
    assert(typeof preview.deployment === 'string' && preview.deployment.length > 0,
        'No Preview deployment is recorded');
    assert(typeof preview.source_commit === 'string' && preview.source_commit.length > 0,
        'The Preview record names no source commit');
    assert(preview.modules_before_opener === 0,
        'Collaboration modules now load before the opener is pressed');
    assert(preview.modules_after_opener > preview.modules_before_opener,
        'The lazy chunk measurement is not a measurement');
    assert(preview.horizontal_page_scroll === false,
        'The deployed shell scrolls horizontally');

    // This is the rule the whole gate exists for. Everything above can pass on a
    // deployment where collaboration is switched off; a journey cannot.
    if (preview.journeys_qualified !== true) {
        assert(manifest.status !== 'PASS',
            'CF-P7-013 claims PASS without a journey qualified against the deployment');
        const blocked = manifest.blocked_on || {};
        assert(typeof blocked.owner_action === 'string' && blocked.owner_action.length > 40,
            'The story is not PASS and records no owner action that would unblock it');
        assert(typeof blocked.reason === 'string' && blocked.reason.length > 120,
            'The blocker carries no substantive reason');
        assert(blocked.agent_permitted === false,
            'A blocker an agent is permitted to clear is not a blocker');
    } else {
        assert(preview.collaboration_enabled === true,
            'Journeys cannot be qualified against a deployment with collaboration disabled');
    }

    // The evidence and the manifest must agree about how far this got. Two
    // records that disagree are worse than one, because the reader has to guess.
    const evidenceStatus = /^Status: (\w+)/m.exec(evidence)?.[1] ?? null;
    assert(evidenceStatus !== null, 'The Preview evidence records no status');
    assert(evidenceStatus === manifest.status,
        `The evidence says ${evidenceStatus} and the manifest says ${manifest.status}`);
    assert(evidence.includes(preview.deployment),
        'The evidence does not name the deployment the manifest records');

    return true;
}
