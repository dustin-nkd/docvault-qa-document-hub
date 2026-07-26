// Workspace switcher (CF-P7-003, surface 2) and the always-visible context
// indicator that satisfies gate UX U2.
//
// The indicator is not part of the menu. U2 requires the active workspace to be
// identifiable "without opening a menu", so the label renders in the chrome and
// the switcher is a separate control next to it.

import { contextLabel, CONTEXT_STATUSES } from './workspace-context.js';

export class WorkspaceSwitcherError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'WorkspaceSwitcherError';
        this.code = code;
    }
}

const fail = code => { throw new WorkspaceSwitcherError(code); };

const ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer']);

/**
 * Describe the switcher.
 *
 * The `unavailable` status keeps the remembered id visible in the model rather
 * than discarding it, so the surface can say *which* workspace went away instead
 * of a generic failure — and so nothing here can quietly substitute another one.
 *
 * @param {{context: {status: string, workspaceId: string|null, workspace: object|null},
 *          workspaces: ReadonlyArray<{workspaceId: string, displayName: string, role: string}>}} input
 */
export function workspaceSwitcherModel({ context, workspaces } = {}) {
    if (!context || !CONTEXT_STATUSES.includes(context.status)) fail('INVALID_CONTEXT');
    if (!Array.isArray(workspaces)) fail('WORKSPACES_REQUIRED');
    for (const workspace of workspaces) {
        if (typeof workspace?.displayName !== 'string' || workspace.displayName.length === 0) {
            fail('WORKSPACE_NAME_REQUIRED');
        }
        if (!ROLES.includes(workspace?.role)) fail('INVALID_ROLE');
    }
    return Object.freeze({
        status: context.status,
        label: contextLabel(context),
        activeWorkspaceId: context.status === 'active' ? context.workspaceId : null,
        // Present even when unavailable, so the surface can name what is gone.
        rememberedWorkspaceId: context.status === 'unavailable' ? context.workspaceId : null,
        canSwitch: workspaces.length > 0,
        items: Object.freeze(workspaces.map(workspace => Object.freeze({
            workspaceId: workspace.workspaceId,
            displayName: workspace.displayName,
            role: workspace.role,
            active: workspace.workspaceId === context.workspaceId && context.status === 'active'
        })))
    });
}

/**
 * The always-visible context indicator.
 *
 * Carries a `data-context-status` so a non-active context is distinguishable
 * without relying on colour, and marks itself as the current location for
 * assistive technology.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof workspaceSwitcherModel>} model
 */
export function renderContextIndicator(doc, model) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !CONTEXT_STATUSES.includes(model.status)) fail('MODEL_REQUIRED');
    const root = doc.createElement('div');
    root.className = `collab-context collab-context--${model.status}`;
    root.setAttribute('data-collab-surface', 'workspace-switcher');
    root.setAttribute('data-context-status', model.status);

    const prefix = doc.createElement('span');
    prefix.className = 'collab-context__prefix';
    prefix.textContent = 'Workspace:';
    root.appendChild(prefix);

    const name = doc.createElement('span');
    name.className = 'collab-context__name';
    name.textContent = model.label;
    if (model.status === 'active') name.setAttribute('aria-current', 'true');
    root.appendChild(name);
    return root;
}

/**
 * The switcher control and its list.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof workspaceSwitcherModel>} model
 */
export function renderWorkspaceSwitcher(doc, model) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !CONTEXT_STATUSES.includes(model.status)) fail('MODEL_REQUIRED');

    const root = doc.createElement('div');
    root.className = 'collab-switcher';
    root.setAttribute('data-collab-surface', 'workspace-switcher');
    root.appendChild(renderContextIndicator(doc, model));

    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'collab-switcher__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('data-collab-action', 'workspace-switcher-toggle');
    trigger.textContent = 'Switch workspace';
    // An account with no workspace has nothing to switch to. The control stays
    // visible and disabled with a reason rather than vanishing, per the contract.
    if (!model.canSwitch) {
        trigger.disabled = true;
        trigger.setAttribute('aria-disabled', 'true');
        trigger.setAttribute('title', 'You do not belong to any workspace yet.');
    }
    root.appendChild(trigger);

    const list = doc.createElement('div');
    list.className = 'collab-switcher__list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Your workspaces');
    list.hidden = true;
    for (const item of model.items) {
        const option = doc.createElement('button');
        option.type = 'button';
        option.className = 'collab-switcher__option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', item.active ? 'true' : 'false');
        option.setAttribute('data-collab-action', 'workspace-switch');
        option.setAttribute('data-workspace-id', item.workspaceId);

        const name = doc.createElement('span');
        name.className = 'collab-switcher__name';
        name.textContent = item.displayName;
        option.appendChild(name);

        const role = doc.createElement('span');
        role.className = `collab-role-badge collab-role-badge--${item.role}`;
        role.textContent = item.role;
        option.appendChild(role);

        list.appendChild(option);
    }
    root.appendChild(list);

    const create = doc.createElement('button');
    create.type = 'button';
    create.className = 'collab-switcher__create';
    create.setAttribute('data-collab-action', 'workspace-create-open');
    create.textContent = 'Create workspace';
    root.appendChild(create);
    return root;
}

/**
 * Open or close the list, keeping `aria-expanded` and focus in step.
 *
 * @param {{root: Element, open: boolean}} input
 */
export function setSwitcherOpen({ root, open } = {}) {
    if (!root || typeof root.querySelector !== 'function') fail('ROOT_REQUIRED');
    if (typeof open !== 'boolean') fail('OPEN_REQUIRED');
    const trigger = root.querySelector('.collab-switcher__trigger');
    const list = root.querySelector('.collab-switcher__list');
    if (trigger === null || list === null) fail('SWITCHER_INCOMPLETE');
    if (open && trigger.disabled) return false;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    list.hidden = !open;
    if (open) {
        const selected = list.querySelector('[aria-selected="true"]')
            ?? list.querySelector('.collab-switcher__option');
        if (selected !== null && typeof selected.focus === 'function') selected.focus();
    } else if (typeof trigger.focus === 'function') {
        trigger.focus();
    }
    return open;
}
