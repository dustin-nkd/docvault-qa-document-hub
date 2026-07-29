// The lazy entry point (CF-P7-013).
//
// Every module under js/collaboration/ has been built and gated in isolation.
// This is the one file that joins them to the app, and it exists to be reached
// *only* through a dynamic import triggered by an explicit user action — the
// Phase 7 budget is zero collaboration modules evaluated for a user who never
// opens collaboration.
//
// So the eager side of the app (js/deployment.js, which is dependency-free and
// ships in the initial payload) knows nothing about this file beyond its path,
// and imports it inside a click handler. Nothing here may ever be referenced by
// a script tag or entered into the service worker precache.

import { mountShell, showState, unmountShell, SHELL_ROOT_ID } from './shell.js';
import { resolveContext, createWorkspaceSelection } from './workspace-context.js';
import { accountMenuModel, renderAccountMenu, setAccountMenuOpen } from './account-menu.js';
import {
    workspaceSwitcherModel, renderWorkspaceSwitcher, setSwitcherOpen
} from './workspace-switcher.js';
import { createApiClient, API_BASE, ERROR_PRESENTATION } from './api-client.js';
import { renderSurfacePanel } from './surface-panel.js';
import { createCollaborationServices } from './services.js';
import { readMembers } from './member-list.js';
import { readAuditEvents } from './audit-activity.js';
import {
    readKeyReadiness, runDeviceRegistration, runDeviceRevocation, unsupportedGuidance
} from './device-initialization.js';
import { DeviceKeyLifecycle } from './device-key-lifecycle.js';
import { runCreateWorkspace, validateDisplayName } from './create-workspace.js';
import { sealCreatorEnvelope } from './workspace-key-envelope.js';
import { createDeviceRecordStore, newUnlockSecret, decodeUnlockSecret } from './device-record.js';
import {
    acceptInvitation, reviewInvitation, takeTokenFromFragment
} from './invitation-accept.js';
import {
    copyAcceptanceUrl, createInvitation, revokeInvitation, validateDisplayLogin
} from './invitations.js';
import { deriveSyncState } from './sync-state.js';

/**
 * A workspace id no real workspace can ever have, standing in for "none yet".
 *
 * `DeviceKeyLifecycle` binds its context to a workspace because a later
 * workspace-scoped operation reuses the same instance across a `changeContext`
 * call. Registering a device happens before any workspace is chosen, and the
 * private-key protection this lifecycle performs never reads `workspaceId` —
 * see `device-key-lifecycle.js`'s `privateAad`, which omits it — so a
 * placeholder here binds nothing security-relevant. `changeContext` is called
 * with the real id the moment a workspace is entered.
 */
const PLACEHOLDER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000000';

/** `environment` as this app names it, to what `DeviceKeyLifecycle` accepts. */
const LIFECYCLE_ENVIRONMENT = Object.freeze({
    local: 'local-browser-test', preview: 'preview', production: 'production'
});

export const CHROME_ID = 'collaboration-chrome';

/**
 * Open collaboration.
 *
 * `deployment` is the verdict the eager module already computed, passed in
 * rather than recomputed, so there is exactly one answer to "can collaboration
 * run here" in the app.
 *
 * `session` and `workspaces` are supplied by the caller. This entry performs no
 * network call of its own: what it renders is what it was handed, and the shell
 * shows `loading` until the caller has something to hand it.
 *
 * @param {{document: Document, deployment: {available: boolean, reason: string},
 *          session?: {authenticated: boolean|null, login?: string, avatarUrl?: string},
 *          workspaces?: ReadonlyArray<object>, storage?: Storage,
 *          environment?: string, subject?: string}} input
 */
export function openCollaboration({ document: doc, deployment, session = { authenticated: null },
    workspaces = [], storage, environment, subject, device = null, data = {} } = {}) {
    const container = mountShell({ document: doc, deployment });
    // Null means the deployment cannot support collaboration. The banner owned
    // by the eager module has already said so; adding a second message here
    // would say the same thing twice.
    if (container === null) return null;

    if (session.authenticated === false) {
        showState(doc, {
            state: 'unauthorized',
            surface: 'base-states',
            title: 'Sign in to collaborate',
            reason: data.invitationLinkTaken === true
                ? 'Sign in with GitHub, then reopen the invitation link. For your privacy, '
                    + 'this page does not save invitation links across sign-in.'
                : 'Team workspaces need a signed-in GitHub account.',
            action: { label: 'Sign in with GitHub', id: 'sign-in' }
        });
        return container;
    }
    if (session.authenticated !== true) {
        showState(doc, {
            state: 'loading', surface: 'base-states', title: 'Checking your session'
        });
        return container;
    }

    // A remembered selection is read only where a caller gave us somewhere to
    // read it from; a missing store is no selection, never an error.
    let remembered = null;
    if (storage && environment && subject) {
        try {
            remembered = createWorkspaceSelection({ storage, environment, subject }).read();
        } catch {
            remembered = null;
        }
    }

    const context = resolveContext({ remembered, workspaces });
    const chrome = doc.createElement('div');
    chrome.className = 'collab-chrome';
    chrome.id = CHROME_ID;
    const switcher = renderWorkspaceSwitcher(doc,
        workspaceSwitcherModel({ context, workspaces }));
    const account = renderAccountMenu(doc, accountMenuModel({ session }));
    chrome.append(switcher, account);
    // The chrome names where you are; the panel is everything you can do there.
    // Composed in one call so a surface is never quietly omitted -- see
    // surface-panel.js for why an absent surface is worse than a loading one.
    const panel = renderSurfacePanel({
        document: doc, context, session, device: device ?? null, data: data ?? {}
    });
    container.replaceChildren(chrome, panel);

    bindDisclosure(chrome, switcher, '.collab-switcher__trigger', setSwitcherOpen);
    bindDisclosure(chrome, account, '.collab-account__trigger', setAccountMenuOpen);
    return container;
}

/**
 * Wire one disclosure: toggle on its trigger, close on Escape.
 *
 * Escape is handled on the chrome rather than the document so collaboration
 * cannot swallow a key press meant for a Personal Vault view.
 */
function bindDisclosure(chrome, root, triggerSelector, setOpen) {
    const trigger = root.querySelector(triggerSelector);
    if (trigger === null) return;
    trigger.addEventListener('click', () => {
        setOpen({ root, open: trigger.getAttribute('aria-expanded') !== 'true' });
    });
    chrome.addEventListener('keydown', event => {
        if (event.key === 'Escape') setOpen({ root, open: false });
    });
}

/**
 * Wire the "Sign in with GitHub" control the unauthorized state renders.
 *
 * Delegated on `container` rather than bound to the button node directly, in
 * the same pattern the workspace switcher uses below: the base state is
 * replaced wholesale on every repaint, and a handler bound to a node that no
 * longer exists is exactly how a shell of this shape leaks listeners.
 *
 * On success this navigates the browser away to GitHub, so there is no
 * "after" to paint — the page the user returns to is the callback redirect,
 * which starts this whole flow over from `resolveSession()`.
 *
 * @param {Element|null} container
 * @param {{beginSignIn: (input?: {returnPath?: string}) => Promise<object>}} api
 * @param {Document} doc
 */
function bindSignIn(container, api, doc) {
    if (container === null || typeof container.addEventListener !== 'function') return;
    container.addEventListener('click', event => {
        const control = typeof event.target?.closest === 'function'
            ? event.target.closest('[data-collab-action="sign-in"]')
            : null;
        if (control === null || control.disabled === true) return;
        control.disabled = true;
        void (async () => {
            const result = await api.beginSignIn();
            if (!result.ok) {
                control.disabled = false;
                showState(doc, {
                    state: 'error',
                    surface: 'base-states',
                    title: 'Could not start sign-in',
                    reason: result.failure.reason
                });
                return;
            }
            const target = doc?.defaultView?.location;
            if (target) target.href = result.data.authorizationUrl;
        })();
    });
}

/**
 * Open collaboration by asking the deployment, rather than being told.
 *
 * `openCollaboration` renders what it is handed and performs no transport; this
 * is what hands it something. The split is deliberate — every state below is
 * still reachable synchronously in a test without a fake network, and the one
 * function that awaits is the one that has a reason to.
 *
 * Two answers come back from a single `GET /api/v1/session`, because they are
 * one question asked of one deployment:
 *
 *   - whether collaboration runs here at all. `js/deployment.js` already said
 *     the hostname *could* host it, which is true of every *.pages.dev origin
 *     including the Production deployment where the feature is switched off and
 *     no database exists. The API answers `COLLABORATION_UNAVAILABLE` there,
 *     and that answer wins.
 *   - and, if it does, who the user is.
 *
 * When the deployment says no, the message has to come from here. The banner
 * that would normally explain an unavailable deployment is hidden on Cloudflare
 * — correctly, since the hostname really is a Cloudflare one — so staying quiet
 * would leave a user who pressed a button looking at nothing.
 *
 * @param {{document: Document, deployment: {available: boolean, reason: string},
 *          client?: object, fetch?: Function, storage?: Storage,
 *          environment?: string, subject?: string,
 *          loadWorkspaces?: (client: object) => Promise<Array<object>>,
 *          clipboard?: {writeText: Function},
 *          deviceLifecycleFactory?: (input: object) => object}} input
 */
export async function startCollaboration({ document: doc, deployment, client, fetch: transport,
    storage, environment, subject, loadWorkspaces, location, history,
    clipboard = doc?.defaultView?.navigator?.clipboard,
    deviceLifecycleFactory = input => new DeviceKeyLifecycle(input) } = {}) {
    // The fragment is a bearer secret. Take it before mountShell paints even a
    // loading state, and overwrite the history entry in the same operation.
    // It remains only in this invocation's closure; it is never put in a store.
    let invitationToken = location && history
        ? takeTokenFromFragment({ location, history }).token
        : null;
    const container = mountShell({ document: doc, deployment });
    if (container === null) return null;

    // No `fetch` named here even as a fallback: the client resolves the global,
    // and it is the only module under js/collaboration/ that may.
    const api = client ?? createApiClient({ fetch: transport });
    const resolved = await api.resolveSession();

    if (resolved.available === false) {
        showState(doc, {
            state: 'error',
            surface: 'base-states',
            title: 'Collaboration is not enabled here',
            reason: ERROR_PRESENTATION.COLLABORATION_UNAVAILABLE.reason
        });
        return container;
    }

    if (resolved.authenticated !== true) {
        // A failure that is not a denial gets its own reason rather than being
        // shown as a sign-in prompt the user cannot act on.
        if (resolved.failure !== null && resolved.failure.ui === 'error') {
            showState(doc, {
                state: 'error',
                surface: 'base-states',
                title: 'Collaboration could not be reached',
                reason: resolved.failure.reason
            });
            return container;
        }
        const unauthenticated = openCollaboration({
            document: doc,
            deployment,
            session: { authenticated: false },
            data: { invitationLinkTaken: invitationToken !== null }
        });
        bindSignIn(unauthenticated, api, doc);
        return unauthenticated;
    }

    // Workspaces are a separate authorized read, and a failure to list them is
    // not a failure to sign in: the session stands, the list is simply empty,
    // and the switcher's own empty state says so.
    let workspaces = [];
    if (typeof loadWorkspaces === 'function') {
        workspaces = await loadWorkspaces(api);
    } else {
        const page = await api.list({ path: `${API_BASE}/workspaces` });
        workspaces = page.ok ? [...page.items] : [];
    }

    const session = {
        authenticated: true,
        login: resolved.user?.login,
        avatarUrl: resolved.user?.avatarUrl,
        userId: resolved.user?.userId
    };
    const identity = subject ?? resolved.user?.userId;
    const services = createCollaborationServices({ client: api });

    // This browser's registered device, if it has one — read once at open and
    // kept in a local variable rather than in `data`, because it is a chrome-
    // wide fact (every surface's `blocked` reasoning depends on it), not a
    // per-workspace one.
    const deviceStore = storage && environment && identity
        ? openDeviceStore({ storage, environment, subject: identity })
        : null;
    const storedDevice = deviceStore?.read() ?? null;
    let currentDevice = storedDevice === null
        ? null
        : deviceModelFor(storedDevice.deviceId, storedDevice.fingerprint, storedDevice.state);
    let lifecycle = null;

    // Every workspace-scoped route requires the acting device in a header, so
    // the client has to be told which device this browser is before any of
    // them is called — including on a reload, where the device was registered
    // in an earlier session and only the stored record remembers it.
    api.setActingDevice(currentDevice?.state === 'active' ? currentDevice.deviceId : null);

    let lastPaintData = {};
    let invitationCopyPending = false;
    let invitationRevokePendingId = null;
    let invitationAcceptPending = false;
    const paint = data => {
        lastPaintData = data;
        return openCollaboration({
            document: doc, deployment, session, workspaces, storage, environment,
            subject: identity, device: currentDevice, data
        });
    };
    const repaint = patch => paint({ ...lastPaintData, ...patch });

    /** One `DeviceKeyLifecycle`, its device id moved onto whichever this is now. */
    function ensureLifecycle(deviceId) {
        if (lifecycle !== null) {
            lifecycle.changeContext({ ...lifecycle.context, deviceId });
            return lifecycle;
        }
        lifecycle = deviceLifecycleFactory({
            environment: LIFECYCLE_ENVIRONMENT[environment] ?? 'production',
            context: { userId: identity, deviceId, workspaceId: PLACEHOLDER_WORKSPACE_ID }
        });
        return lifecycle;
    }

    /**
     * Register this browser as a device (CF-P7-005's journey, wired for the
     * first time). No passphrase surface exists yet, so the unlock secret that
     * protects the local private key is generated here and stored alongside it
     * — an accepted MVP tradeoff, not a silent one: see the decision log.
     */
    async function registerThisDevice() {
        if (currentDevice !== null && currentDevice.state === 'active') return;
        const localDeviceId = globalThis.crypto.randomUUID();
        const unlockSecret = newUnlockSecret();
        repaint({ deviceStatus: 'enrolling', deviceFailure: null });
        try {
            const result = await runDeviceRegistration({
                lifecycle: ensureLifecycle(localDeviceId),
                api: services,
                newDeviceId: () => localDeviceId,
                newIdempotencyKey: () => services.newIdempotencyKey(),
                unlockSecret: decodeUnlockSecret(unlockSecret),
                onStep: status => repaint({ deviceStatus: status })
            });
            currentDevice = deviceModelFor(result.deviceId, result.fingerprint, 'active');
            api.setActingDevice(result.deviceId);
            deviceStore?.write({
                deviceId: result.deviceId, fingerprint: result.fingerprint, state: 'active',
                publicJwk: result.publicJwk, unlockSecret
            });
            repaint({ deviceStatus: 'registered', deviceFailure: null });
        } catch (error) {
            repaint({ deviceStatus: 'failed', deviceFailure: deviceFailureFrom(error) });
        }
    }

    /** Revoke this device: server first, then the local key (CF-P7-005). */
    async function revokeThisDevice() {
        if (currentDevice === null || currentDevice.state !== 'active') return;
        const deviceId = currentDevice.deviceId;
        repaint({ deviceStatus: 'revoking', deviceFailure: null });
        try {
            await runDeviceRevocation({
                lifecycle: ensureLifecycle(deviceId),
                api: services,
                deviceId,
                newIdempotencyKey: () => services.newIdempotencyKey(),
                onStep: status => repaint({ deviceStatus: status })
            });
            currentDevice = null;
            api.setActingDevice(null);
            deviceStore?.clear();
            repaint({ deviceStatus: 'revoked', deviceFailure: null });
        } catch (error) {
            repaint({ deviceStatus: 'failed', deviceFailure: deviceFailureFrom(error) });
        }
    }

    /**
     * Create a workspace (CF-P7-004's journey, wired for the first time).
     *
     * Read from the DOM at submit rather than kept live in `data` on every
     * keystroke — a repaint on each keystroke would replace the input node and
     * drop focus mid-word, since this panel repaints by replacing its subtree,
     * not by diffing it.
     */
    async function submitCreateWorkspace(nameValue) {
        if (currentDevice === null || currentDevice.state !== 'active') return;
        const nameCheck = validateDisplayName(nameValue);
        if (!nameCheck.valid) {
            repaint({
                workspaceName: nameValue, createStatus: 'naming',
                createFailure: { code: 'VALIDATION_FAILED', presentation: 'error', expected: true,
                    reason: nameCheck.message }
            });
            return;
        }
        const record = deviceStore?.read();
        if (!record) return;
        repaint({ workspaceName: nameValue, createStatus: 'binding', createFailure: null });
        try {
            const result = await runCreateWorkspace({
                api: services,
                keys: {
                    sealCreatorEnvelope: ({ workspaceId, keyVersion, ownerDeviceId, ownerFingerprint }) =>
                        sealCreatorEnvelope({
                            workspaceId, keyVersion, ownerDeviceId, ownerFingerprint,
                            ownerUserId: identity, ownerPublicJwk: record.publicJwk
                        })
                },
                selection: selection ?? Object.freeze({ write() { return false; } }),
                newIdempotencyKey: () => services.newIdempotencyKey(),
                displayName: nameValue,
                ownerDeviceId: currentDevice.deviceId,
                onStep: status => repaint({ workspaceName: nameValue, createStatus: status })
            });
            if (result.status !== 'created') {
                repaint({ workspaceName: nameValue, createStatus: 'failed', createFailure: result.failure });
                return;
            }
            workspaces = [...workspaces, {
                workspaceId: result.workspaceId, displayName: nameValue, role: 'owner'
            }];
            await enter(result.workspaceId);
        } catch {
            repaint({
                workspaceName: nameValue, createStatus: 'failed',
                createFailure: { code: 'UNKNOWN', presentation: 'error', expected: false,
                    reason: 'The workspace could not be created. Nothing was left half-created.' }
            });
        }
    }

    /**
     * Invite someone (CF-P7-007's journey, wired for the first time).
     *
     * The one-time acceptance URL comes back once and is never fetched again,
     * so it is put straight into the paint rather than held anywhere else: the
     * surface shows it with its own warning, and losing it means revoking and
     * re-issuing rather than looking it up.
     */
    async function sendInvitation(login, role) {
        const workspaceId = selection?.read() ?? null;
        if (workspaceId === null) return;
        const check = validateDisplayLogin(login);
        if (!check.valid) {
            repaint({ inviteLogin: login, inviteRole: role, inviteFailure: check.message });
            return;
        }
        repaint({
            inviteLogin: login,
            inviteRole: role,
            inviteStatus: 'creating',
            inviteFailure: null,
            inviteCopyStatus: 'idle',
            inviteCopyNotice: null
        });
        try {
            const result = await createInvitation({
                api: services,
                workspaceId,
                displayLogin: login,
                role,
                newIdempotencyKey: () => services.newIdempotencyKey()
            });
            // Re-read the list so the new invitation appears alongside the URL
            // rather than only as a URL the user has to trust arrived.
            const listed = await settle(() => services.listInvitations({ workspaceId }));
            repaint({
                inviteLogin: '',
                inviteRole: role,
                inviteStatus: 'idle',
                inviteFailure: null,
                inviteCopyStatus: 'idle',
                inviteCopyNotice: null,
                // The surface owns the one-time URL holder, not the creation
                // result around it. Passing the wrapper would make
                // invitationModel call cleared()/read() on the wrong object
                // after the server had already consumed the one chance to
                // return the token.
                issuedInvitation: result.held,
                ...(listed.ok ? { invitations: [...listed.value.items] } : {})
            });
        } catch (error) {
            repaint({
                inviteLogin: login,
                inviteRole: role,
                inviteStatus: 'idle',
                inviteFailure: error?.reason
                    ?? 'The invitation could not be created. Nothing was sent.'
            });
        }
    }

    /**
     * Copy the one-time invitation URL through the single injected browser
     * boundary.
     *
     * The holder is captured before awaiting the Clipboard API. A later
     * invitation may replace it while permission is being resolved; in that
     * case this operation may clear only the holder it actually copied and may
     * not repaint over the newer URL.
     */
    async function copyInvitationLink() {
        if (invitationCopyPending) return;
        const held = lastPaintData.issuedInvitation;
        if (!held || typeof held.read !== 'function' || held.cleared()) return;

        invitationCopyPending = true;
        repaint({ inviteCopyStatus: 'copying', inviteCopyNotice: null });
        try {
            const result = await copyAcceptanceUrl({ clipboard, held });
            if (result.copied) held.clear();
            if (lastPaintData.issuedInvitation !== held) return;
            repaint({
                issuedInvitation: result.copied ? null : held,
                inviteCopyStatus: result.copied ? 'copied' : 'blocked',
                inviteCopyNotice: result.copied
                    ? 'Invitation link copied and cleared from this page.'
                    : result.reason
            });
        } finally {
            invitationCopyPending = false;
        }
    }

    /**
     * Revoke one exact pending invitation and reconcile the list afterward.
     *
     * The in-memory guard is set before the first await, so two delegated
     * clicks cannot mint two idempotency keys or send two DELETE requests. A
     * list refusal after a successful DELETE falls back to removing the exact
     * row locally; it must not resurrect a terminal invitation. None of these
     * patches mention `issuedInvitation`, so an unrelated one-time URL holder
     * survives both success and refusal.
     */
    async function revokePendingInvitation(invitationId) {
        if (invitationRevokePendingId !== null) return;
        const workspaceId = selection?.read() ?? null;
        const invitations = lastPaintData.invitations;
        if (workspaceId === null || !Array.isArray(invitations)
            || !invitations.some(item => item.invitationId === invitationId)) return;

        invitationRevokePendingId = invitationId;
        const startingFailures = { ...(lastPaintData.inviteRevokeFailures ?? {}) };
        delete startingFailures[invitationId];
        repaint({
            inviteStatus: 'revoking',
            inviteRevokePendingId: invitationId,
            inviteRevokeFailures: startingFailures
        });
        try {
            await revokeInvitation({
                api: services,
                workspaceId,
                invitationId,
                newIdempotencyKey: () => services.newIdempotencyKey()
            });
            const listed = await settle(() => services.listInvitations({ workspaceId }));
            invitationRevokePendingId = null;
            if (selection?.read() !== workspaceId) return;
            const failures = { ...(lastPaintData.inviteRevokeFailures ?? {}) };
            delete failures[invitationId];
            const current = Array.isArray(lastPaintData.invitations)
                ? lastPaintData.invitations
                : invitations;
            repaint({
                inviteStatus: 'idle',
                inviteRevokePendingId: null,
                inviteRevokeFailures: failures,
                invitations: listed.ok
                    ? listed.value.items.filter(item => item.invitationId !== invitationId)
                    : current.filter(item => item.invitationId !== invitationId)
            });
        } catch (error) {
            invitationRevokePendingId = null;
            if (selection?.read() !== workspaceId) return;
            repaint({
                inviteStatus: 'idle',
                inviteRevokePendingId: null,
                inviteRevokeFailures: {
                    ...(lastPaintData.inviteRevokeFailures ?? {}),
                    [invitationId]: error?.reason
                        ?? 'The invitation could not be revoked. Nothing was changed; try again.'
                }
            });
        }
    }

    // Taken out of the address bar before anything is painted, and the history
    // entry that carried it is overwritten in the same step — so no render, no
    // back-navigation, and no failure below can leave the token on screen.
    /**
     * Accept the one invitation token held by this invocation.
     *
     * The guard is set before the first await, so a double click sends one
     * mutation and mints one idempotency key. A refusal keeps the token only in
     * memory for a deliberate retry; success clears it before repainting.
     */
    async function acceptHeldInvitation() {
        if (invitationAcceptPending || typeof invitationToken !== 'string') return;
        const review = lastPaintData.invitationReview;
        if (!review || review.state !== 'pending' || review.identityMatch === false
            || currentDevice === null || currentDevice.state !== 'active') return;

        invitationAcceptPending = true;
        repaint({ invitationAcceptStatus: 'accepting', invitationAcceptFailure: null });
        try {
            await acceptInvitation({
                api: services,
                token: invitationToken,
                deviceId: currentDevice.deviceId,
                newIdempotencyKey: () => services.newIdempotencyKey()
            });
            invitationToken = null;
            invitationAcceptPending = false;
            // Refreshing the account list makes the pending_key workspace
            // available in the switcher. A list refusal cannot turn a committed
            // acceptance into a failed mutation.
            const listed = await settle(() => services.listWorkspaces());
            if (listed.ok) workspaces = [...listed.value.items];
            repaint({
                invitationAcceptStatus: 'accepted',
                invitationAcceptFailure: null
            });
        } catch (error) {
            invitationAcceptPending = false;
            repaint({
                invitationAcceptStatus: 'failed',
                invitationAcceptFailure: {
                    code: error?.code ?? 'INVITATION_ACCEPT_FAILED',
                    reason: error?.reason
                        ?? 'The invitation could not be accepted. Nothing was changed; try again.'
                }
            });
        }
    }

    // Choosing a workspace is what makes every workspace-scoped surface mean
    // anything, and the switcher renders its options as controls with nothing
    // listening to them until here. Delegated on the container rather than bound
    // per option: the panel and the chrome are both replaced on every repaint,
    // and handlers bound to nodes that no longer exist are how a shell of this
    // shape leaks listeners and stops responding.
    const selection = openSelection({ storage, environment, subject: identity });
    if (typeof container.addEventListener === 'function') {
        container.addEventListener('click', event => {
            const control = typeof event.target?.closest === 'function'
                ? event.target.closest('[data-collab-action]')
                : null;
            if (control === null || control.disabled === true) return;
            const action = control.getAttribute('data-collab-action');

            if (action === 'workspace-switch') {
                const workspaceId = control.getAttribute('data-workspace-id');
                if (!workspaces.some(item => item.workspaceId === workspaceId)) return;
                // Written before the reads start, so a reload lands the user back
                // where they chose rather than wherever the list happens to begin
                // — the half of U2 that is easiest to lose.
                selection?.write(workspaceId);
                void enter(workspaceId);
                return;
            }
            if (action === 'register-device') {
                void registerThisDevice();
                return;
            }
            if (action === 'revoke-this-device') {
                // Destructive dispatch is scoped by both action and owning
                // surface. A forged or accidentally reused action inside a
                // member row must not reach this browser's private-key
                // lifecycle, acting-device header, or local device record.
                const surface = typeof control.closest === 'function'
                    ? control.closest('[data-collab-surface]')
                    : null;
                if (surface?.getAttribute('data-collab-surface')
                    !== 'device-key-initialization') return;
                void revokeThisDevice();
                return;
            }
            if (action === 'create-invitation') {
                const surface = typeof control.closest === 'function'
                    ? control.closest('[data-collab-surface="invitation-manage"]')
                    : null;
                const loginField = surface?.querySelector('.collab-invites__login-input');
                const roleField = surface?.querySelector('.collab-invites__role-input');
                void sendInvitation(loginField?.value ?? '', roleField?.value ?? 'editor');
                return;
            }
            if (action === 'copy-acceptance-link') {
                const surface = typeof control.closest === 'function'
                    ? control.closest('[data-collab-surface="invitation-manage"]')
                    : null;
                if (surface === null) return;
                void copyInvitationLink();
                return;
            }
            if (action === 'revoke-invitation') {
                const surface = typeof control.closest === 'function'
                    ? control.closest('[data-collab-surface="invitation-manage"]')
                    : null;
                const row = typeof control.closest === 'function'
                    ? control.closest('[data-invitation-id]')
                    : null;
                const invitationId = control.getAttribute('data-invitation-id');
                if (surface === null || row?.getAttribute('data-invitation-id') !== invitationId) {
                    return;
                }
                void revokePendingInvitation(invitationId);
                return;
            }
            if (action === 'accept-invitation') {
                const surface = typeof control.closest === 'function'
                    ? control.closest('[data-collab-surface="invitation-accept"]')
                    : null;
                if (surface === null) return;
                void acceptHeldInvitation();
                return;
            }
            if (action === 'device-setup-open') {
                // This is the same journey the real "Set up this device"
                // control runs, reached from inside the blocked message rather
                // than from the device surface further down the panel. It must
                // actually run it: a shortcut that only moves focus is
                // indistinguishable from doing nothing on a page where every
                // surface is already visible at once.
                void registerThisDevice();
            }
        });

        // The create-workspace surface is a real `<form>` so Enter submits it;
        // delegated for the same reason the switcher is above — the panel is
        // replaced wholesale on every repaint.
        container.addEventListener('submit', event => {
            const form = typeof event.target?.closest === 'function'
                ? event.target.closest('[data-collab-surface="create-workspace"]')
                : null;
            if (form === null) return;
            event.preventDefault();
            const submitControl = form.querySelector('[data-collab-action="workspace-create-submit"]');
            if (submitControl?.disabled === true) return;
            const nameInput = form.querySelector('#collab-create-name');
            void submitCreateWorkspace(nameInput ? nameInput.value : '');
        });

        // Keeps the submit control in sync with what was actually typed,
        // without repainting the panel on every keystroke (which would replace
        // the input node and drop focus mid-word). createWorkspaceModel's own
        // canSubmit reads data.workspaceName, which nothing sets until a
        // submit is attempted — so left unpatched, the control stays disabled
        // no matter what is typed, since enabling it and learning the name are
        // the same event. This mirrors that one check, directly on the node.
        container.addEventListener('input', event => {
            const input = event.target;
            if (!input || typeof input.closest !== 'function') return;

            if (input.id === 'collab-create-name') {
                const form = input.closest('[data-collab-surface="create-workspace"]');
                const submitControl = form?.querySelector('[data-collab-action="workspace-create-submit"]');
                if (!submitControl) return;
                const deviceReady = currentDevice !== null && currentDevice.state === 'active';
                const canSubmit = deviceReady && validateDisplayName(input.value).valid;
                submitControl.disabled = !canSubmit;
                submitControl.setAttribute('aria-disabled', String(!canSubmit));
                return;
            }

            // The invitation username, for the same reason: its model only
            // learns the typed value when the control is pressed, and the
            // control is disabled until the model has it.
            if (input.className === 'collab-invites__login-input') {
                const surface = input.closest('[data-collab-surface="invitation-manage"]');
                const sendControl = surface?.querySelector('[data-collab-action="create-invitation"]');
                if (!sendControl) return;
                const canSend = validateDisplayLogin(input.value).valid;
                sendControl.disabled = !canSend;
                sendControl.setAttribute('aria-disabled', String(!canSend));
            }
        });
    }

    /**
     * Load and paint one workspace, from nothing selected or from another one.
     *
     * The loading paint comes first every time, including on a switch: leaving
     * the previous workspace's members on screen while the next one's are
     * fetched would show one workspace's people under another workspace's name,
     * which is the mixing U1 and U2 exist to prevent.
     */
    async function enter(workspaceId) {
        const context = resolveContext({ remembered: workspaceId, workspaces });
        paint({});
        const [workspaceData, invitation] = await Promise.all([
            loadWorkspaceData({ services, context, session }),
            loadInvitationReview({ services, token: invitationToken })
        ]);
        // Merged rather than spread over: both halves can carry a `failures`
        // map, and letting the second replace the first would silently drop one
        // surface's reason for another's.
        paint({
            ...workspaceData,
            ...invitation,
            failures: { ...workspaceData.failures, ...invitation.failures }
        });
        return context.status;
    }

    // The surfaces validate what they render and refuse a record that does not
    // match the contract — a workspace ID that is not the shape the server
    // issues, for instance. That refusal is correct and must stay loud, but it
    // must not surface as a shell left on `loading` forever, which is precisely
    // the failure this story exists to remove. So it lands as an error state
    // with a reason, and the refusal itself is re-thrown to nobody's console but
    // preserved in the state the user can see.
    try {
        await enter(selection?.read() ?? null);
        return container;
    } catch {
        showState(doc, {
            state: 'error',
            surface: 'base-states',
            title: 'Collaboration could not be displayed',
            reason: 'The workspace data did not match what this version expects. '
                + 'Reload the page; if it keeps happening, the app needs an update.'
        });
        return container;
    }
}

/**
 * Open the remembered-workspace selection, or answer that there is none.
 *
 * A store that is missing, blocked, or full is no selection — never an error.
 * Returning the selection rather than the value it holds is what lets the switch
 * handler write through the same object the initial read came from, so the two
 * cannot disagree about which workspace is current and show one name in the
 * chrome over another one's members.
 */
function openSelection({ storage, environment, subject }) {
    if (!storage || !environment || !subject) return null;
    try {
        return createWorkspaceSelection({ storage, environment, subject });
    } catch {
        return null;
    }
}

/**
 * The `device` object handed to both `create-workspace.js` and
 * `device-initialization.js`.
 *
 * The two disagree on the field name for the same fact: `create-workspace.js`
 * reads `device.status`, `device-initialization.js` reads `device.state`. Both
 * are frozen, gated modules from earlier stories, so rather than picking one
 * name and quietly breaking the other's blocked-reasoning, this carries both.
 */
function deviceModelFor(deviceId, fingerprint, deviceState) {
    return { deviceId, fingerprint, state: deviceState, status: deviceState };
}

/** Open this browser's device record store, or answer that there is none. */
function openDeviceStore({ storage, environment, subject }) {
    if (!storage || !environment || !subject) return null;
    try {
        return createDeviceRecordStore({ storage, environment, subject });
    } catch {
        return null;
    }
}

/**
 * Turn a device-journey error into something `device-initialization.js` can
 * render.
 *
 * Two shapes reach here: a `CollaborationServiceError` from a real network
 * refusal, which already carries a `reason`; and a `DeviceKeyLifecycleError`
 * from the local crypto layer, which does not — that one goes through the
 * Phase 5 guidance table instead, so "this browser cannot do this" reads as
 * that, not as a blank server complaint.
 */
function deviceFailureFrom(error) {
    if (error?.name === 'DeviceKeyLifecycleError') {
        const guidance = unsupportedGuidance(error);
        return { code: guidance.code, reason: `${guidance.title}. ${guidance.action}` };
    }
    return {
        code: error?.code ?? 'UNKNOWN',
        reason: error?.reason ?? 'This could not finish. Nothing was left half-done.'
    };
}

/**
 * Review the invitation the address bar carried, if it carried one.
 *
 * Account-scoped and independent of every workspace read, which is why it runs
 * alongside them rather than after: someone opening an invitation link has no
 * workspace yet, and their one useful surface must not wait on reads that are
 * about a workspace they are not in.
 *
 * A review grants nothing. It describes an invitation so a person can decide,
 * and a failure to describe one is that surface's own error rather than the
 * page's.
 */
async function loadInvitationReview({ services, token }) {
    if (typeof token !== 'string') return {};
    const settled = await settle(() => reviewInvitation({ api: services, token }));
    if (settled.ok) return { invitationReview: settled.value };
    return {
        failures: {
            'invitation-accept': {
                code: settled.error?.code ?? null,
                state: settled.error?.ui === 'unauthorized' ? 'unauthorized' : 'error',
                title: 'This invitation could not be read',
                reason: settled.error?.reason
                    ?? 'The invitation link could not be checked. Ask for a new one.'
            }
        }
    };
}

/** Workspace-scoped reads that only an owner or an admin is entitled to make. */
const PRIVILEGED = Object.freeze(['owner', 'admin']);

/**
 * Ask the workspace everything the panel needs, and let each answer stand alone.
 *
 * Four independent reads, run together and settled independently. Together
 * because they do not depend on each other and a serial chain would make the
 * panel as slow as their sum; independently because a denial on one of them is
 * a fact about that surface and not about the other three — the member list
 * being refused says nothing at all about whether the activity log can be read.
 *
 * Nothing is asked that the current role is not entitled to ask. An editor's
 * invitation list would come back denied, and rendering that denial would be a
 * worse answer than the surface's own role-disabled explanation, which is
 * already correct and already says why.
 */
async function loadWorkspaceData({ services, context, session }) {
    if (context.status !== 'active') return {};
    const workspaceId = context.workspaceId;
    const role = context.workspace.role;
    const privileged = PRIVILEGED.includes(role);

    const data = {
        actor: {
            userId: session.userId,
            role,
            keyReady: context.workspace.keyReadiness === 'key_ready'
        },
        failures: {}
    };

    const [members, invitations, audit, readiness] = await Promise.all([
        settle(() => readMembers({ api: services, workspaceId })),
        privileged ? settle(() => services.listInvitations({ workspaceId })) : null,
        privileged ? settle(() => readAuditEvents({ api: services, workspaceId })) : null,
        settle(() => readKeyReadiness({ api: services, workspaceId }))
    ]);

    record(data, 'member-list-role-badge', members, page => { data.members = [...page.items]; });
    // A role that may not read these is not a failure and must not render as
    // one: the empty list lets each surface draw its own explained-disabled
    // state, which is what the contract asks for.
    if (invitations === null) data.invitations = [];
    else record(data, 'invitation-manage', invitations, page => {
        data.invitations = [...page.items];
    });
    if (audit === null) data.auditEvents = [];
    else record(data, 'audit-activity', audit, page => {
        data.auditEvents = [...page.items];
        data.auditCursor = page.nextCursor;
    });
    // Readiness is the one read whose failure is not worth a surface-wide error:
    // the device surface renders perfectly well without it, and it is the only
    // part of that surface a browser holding no enrolled key could show anyway.
    if (readiness.ok) data.keyReadiness = readiness.value.readiness;

    data.syncState = await deriveWorkspaceSyncState({ services, context, data });
    return data;
}

/** Run one read to a verdict rather than to an exception. */
async function settle(read) {
    try {
        return { ok: true, value: await read(), error: null };
    } catch (error) {
        return { ok: false, value: null, error };
    }
}

/** Apply a settled read: its value, or the reason there is none. */
function record(data, surface, settled, apply) {
    if (settled.ok) {
        apply(settled.value);
        return;
    }
    data.failures[surface] = {
        code: settled.error?.code ?? null,
        state: settled.error?.ui === 'unauthorized' ? 'unauthorized' : 'error',
        title: settled.error?.ui === 'unauthorized'
            ? 'Sign in to see this'
            : 'This section could not be loaded',
        reason: settled.error?.reason
            ?? 'The workspace could not be reached for this section. Nothing was changed.'
    };
}

/** The codes that could mean a membership ended, rather than a record missing. */
const REMOVAL_CANDIDATES = Object.freeze(['RESOURCE_NOT_FOUND', 'OPERATION_NOT_PERMITTED']);

/**
 * Which of the five sync states the open workspace is in.
 *
 * `Access removed` is the careful one and the reason this is a function rather
 * than a constant. The API answers the same non-disclosing code whether or not a
 * resource exists, precisely so a stranger cannot probe for workspaces — so the
 * state may not be inferred from a denial. It is claimed only after the
 * workspace list, which the caller is always entitled to read, comes back
 * without this workspace in it. A re-check that itself fails claims nothing.
 */
async function deriveWorkspaceSyncState({ services, context, data }) {
    // The code is carried from the read that was actually refused, never
    // supplied here: a state machine fed an invented input is not a state
    // machine, and `Access removed` is the one state that must not be guessable.
    const lastErrorCode = Object.values(data.failures)
        .map(failure => failure.code)
        .find(code => REMOVAL_CANDIDATES.includes(code)) ?? null;

    let membershipRecheck = null;
    if (lastErrorCode !== null) {
        try {
            const page = await services.listWorkspaces();
            membershipRecheck = {
                checked: true,
                activeMember: page.items
                    .some(item => item.workspaceId === context.workspaceId)
            };
        } catch {
            // Unknown is not removed. Claiming otherwise on a re-check that did
            // not complete would be exactly the disclosure the shared
            // non-disclosing denial code exists to prevent.
            membershipRecheck = null;
        }
    }

    return deriveSyncState({
        entries: [],
        online: true,
        transportAvailable: true,
        lastErrorCode,
        membershipRecheck
    }).state;
}

/**
 * Close collaboration and leave nothing behind.
 *
 * @param {Document} doc
 */
export function closeCollaboration(doc) {
    return unmountShell(doc);
}

export { SHELL_ROOT_ID };
