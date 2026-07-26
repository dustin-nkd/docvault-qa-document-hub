// Account menu (CF-P7-003, surface 1).
//
// Shows who you are signed in as and lets you sign out. It deliberately shows
// the provider login rather than any personal-vault identity: the two are
// different accounts and conflating them in the chrome is the first step toward
// mixing their data.

export class AccountMenuError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'AccountMenuError';
        this.code = code;
    }
}

const fail = code => { throw new AccountMenuError(code); };
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

/**
 * Describe the menu for a session.
 *
 * A signed-out visitor is not an error and not an empty state: they get an
 * explicit `signed-out` model with a sign-in action, because "sign in" is
 * actionable and "nothing here" is not.
 *
 * @param {{session: {authenticated: boolean, login?: string, avatarUrl?: string|null}|null}} input
 */
export function accountMenuModel({ session } = {}) {
    if (session === null || session === undefined) {
        return Object.freeze({
            state: 'loading', label: 'Checking your session', login: null,
            avatarUrl: null, items: Object.freeze([])
        });
    }
    if (typeof session.authenticated !== 'boolean') fail('SESSION_SHAPE_INVALID');
    if (!session.authenticated) {
        return Object.freeze({
            state: 'signed-out', label: 'Signed out', login: null, avatarUrl: null,
            items: Object.freeze([Object.freeze({ id: 'sign-in', label: 'Sign in with GitHub' })])
        });
    }
    if (!nonEmpty(session.login)) fail('LOGIN_REQUIRED');
    // An avatar URL is decorative and optional, but it must be https if present:
    // an http image on the collaboration chrome would be a mixed-content warning
    // on every surface.
    const avatarUrl = nonEmpty(session.avatarUrl) && session.avatarUrl.startsWith('https://')
        ? session.avatarUrl
        : null;
    return Object.freeze({
        state: 'signed-in',
        label: session.login,
        login: session.login,
        avatarUrl,
        items: Object.freeze([Object.freeze({ id: 'sign-out', label: 'Sign out' })])
    });
}

/**
 * Build the menu. The trigger always carries a text label, never an avatar
 * alone: an image-only control gives a screen reader nothing to announce and
 * disappears entirely if the image fails.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof accountMenuModel>} model
 */
export function renderAccountMenu(doc, model) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || typeof model.state !== 'string') fail('MODEL_REQUIRED');

    const root = doc.createElement('div');
    root.className = 'collab-account';
    root.setAttribute('data-collab-surface', 'account-menu');
    root.setAttribute('data-account-state', model.state);

    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'collab-account__trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('data-collab-action', 'account-menu-toggle');
    trigger.disabled = model.state === 'loading';

    if (model.avatarUrl !== null) {
        const avatar = doc.createElement('img');
        avatar.className = 'collab-account__avatar';
        avatar.setAttribute('src', model.avatarUrl);
        avatar.setAttribute('alt', '');
        avatar.setAttribute('aria-hidden', 'true');
        trigger.appendChild(avatar);
    }
    const label = doc.createElement('span');
    label.className = 'collab-account__label';
    label.textContent = model.label;
    trigger.appendChild(label);
    root.appendChild(trigger);

    const menu = doc.createElement('div');
    menu.className = 'collab-account__menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    for (const item of model.items) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'collab-account__item';
        button.setAttribute('role', 'menuitem');
        button.setAttribute('data-collab-action', item.id);
        button.textContent = item.label;
        menu.appendChild(button);
    }
    root.appendChild(menu);
    return root;
}

/**
 * Open or close the menu, keeping `aria-expanded` and focus in step.
 *
 * Closing restores focus to the trigger. Without that the user is dropped at the
 * top of the document and has to tab back to where they were, which is the most
 * common keyboard regression in a menu of this shape.
 *
 * @param {{root: Element, open: boolean}} input
 */
export function setAccountMenuOpen({ root, open } = {}) {
    if (!root || typeof root.querySelector !== 'function') fail('ROOT_REQUIRED');
    if (typeof open !== 'boolean') fail('OPEN_REQUIRED');
    const trigger = root.querySelector('.collab-account__trigger');
    const menu = root.querySelector('.collab-account__menu');
    if (trigger === null || menu === null) fail('MENU_INCOMPLETE');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.hidden = !open;
    if (open) {
        const first = menu.querySelector('.collab-account__item');
        if (first !== null && typeof first.focus === 'function') first.focus();
    } else if (typeof trigger.focus === 'function') {
        trigger.focus();
    }
    return open;
}
