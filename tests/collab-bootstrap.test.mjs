import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createBootstrapContext(firestoreMock = {}) {
    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        document: {
            getElementById: (id) => {
                if (!ctx.elements[id]) {
                    ctx.elements[id] = {
                        id,
                        classList: {
                            _classes: new Set(),
                            add(c) { this._classes.add(c); },
                            remove(c) { this._classes.delete(c); },
                            contains(c) { return this._classes.has(c); }
                        },
                        querySelector: (sel) => null,
                        textContent: ''
                    };
                }
                return ctx.elements[id];
            }
        },
        elements: {},
        firebase: {
            firestore: () => firestoreMock
        },
        ensureFirebase: () => Promise.resolve(),
        CollabAuth: {
            signOutUser: async () => {},
            signInWithGoogle: async () => {},
            getRedirectResult: async () => null,
            onAuthChanged: (cb) => {
                ctx._authCallback = cb;
                return () => { ctx._authUnsubscribed = true; };
            }
        },
        CollabStore: {
            enableOfflinePersistence: async () => {},
            stopListening: () => {}
        },
        location: { hostname: 'docvault-qa-team.firebaseapp.com', search: '' }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    const source = read('js/collab-bootstrap.js');
    vm.runInNewContext(source, ctx);
    return ctx;
}

test('first user bootstrapping creates meta/team (ownerUid, initialized) and members/{uid} with owner role', async () => {
    const store = new Map();

    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    if (store.has(key)) {
                        return { exists: true, data: () => store.get(key) };
                    }
                    return { exists: false, data: () => null };
                },
                set: async (data) => {
                    store.set(`${colName}/${docId}`, data);
                },
                delete: async () => {
                    store.delete(`${colName}/${docId}`);
                }
            })
        })
    };

    const ctx = createBootstrapContext(firestoreMock);
    const user = { uid: 'owner-uid-1', email: 'owner@example.com', displayName: 'Vault Founder' };

    const result = await ctx.CollabBootstrap.initTeamUser(user);
    assert.equal(result.status, 'owner');
    assert.equal(result.role, 'owner');
    assert.equal(result.member.uid, 'owner-uid-1');
    assert.equal(result.member.role, 'owner');

    // Verify meta/team record
    const teamDoc = store.get('meta/team');
    assert.ok(teamDoc, 'meta/team must be created');
    assert.equal(teamDoc.ownerUid, 'owner-uid-1');
    assert.equal(teamDoc.initialized, true);
    assert.equal(teamDoc.name, 'DocVault Team');
    assert.ok(teamDoc.createdAt, 'Must record createdAt');

    // Verify members/{uid} record
    const memberDoc = store.get('members/owner-uid-1');
    assert.ok(memberDoc, 'members/owner-uid-1 must be created');
    assert.equal(memberDoc.uid, 'owner-uid-1');
    assert.equal(memberDoc.role, 'owner');
    assert.equal(memberDoc.email, 'owner@example.com');
});

test('existing team member is recognized and admitted without modifying meta/team', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }],
        ['members/editor-2', { uid: 'editor-2', email: 'editor@example.com', role: 'editor' }]
    ]);

    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return {
                        exists: store.has(key),
                        data: () => store.get(key) || null
                    };
                }
            })
        })
    };

    const ctx = createBootstrapContext(firestoreMock);
    const user = { uid: 'editor-2', email: 'editor@example.com' };

    const result = await ctx.CollabBootstrap.initTeamUser(user);
    assert.equal(result.status, 'member');
    assert.equal(result.role, 'editor');
    assert.equal(result.member.uid, 'editor-2');
});

test('invited user accepts invite, joins as member, and deletes used invite', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }],
        ['invites/collab@example.com', { email: 'collab@example.com', role: 'editor', invitedBy: 'owner-1' }]
    ]);

    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return {
                        exists: store.has(key),
                        data: () => store.get(key) || null
                    };
                },
                set: async (data) => {
                    store.set(`${colName}/${docId}`, data);
                },
                delete: async () => {
                    store.delete(`${colName}/${docId}`);
                }
            })
        })
    };

    const ctx = createBootstrapContext(firestoreMock);
    const user = { uid: 'invited-uid-3', email: 'collab@example.com' };

    const result = await ctx.CollabBootstrap.initTeamUser(user);
    assert.equal(result.status, 'member');
    assert.equal(result.role, 'editor');
    assert.ok(store.has('members/invited-uid-3'), 'Member record was created');
    assert.equal(store.has('invites/collab@example.com'), false, 'Invite was deleted upon joining');
});

test('uninvited authenticated stranger is rejected with exact message "Ask an owner for an invite" and blocked from data', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }]
    ]);

    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    if (key === 'meta/team') {
                        // Under firestore.rules, strangers receive permission-denied once team exists
                        const err = new Error('7 PERMISSION_DENIED: false for \'get\' @ L45');
                        err.code = 'permission-denied';
                        throw err;
                    }
                    return { exists: false, data: () => null };
                },
                set: async () => {
                    throw new Error('Blocked: stranger cannot write');
                }
            })
        })
    };

    const ctx = createBootstrapContext(firestoreMock);
    const stranger = { uid: 'stranger-999', email: 'stranger@example.com' };

    const result = await ctx.CollabBootstrap.initTeamUser(stranger);
    assert.equal(result.status, 'uninvited');
    assert.equal(result.message, 'Ask an owner for an invite');
    assert.equal(ctx.CollabBootstrap.getCurrentMember(), null);
});

test('signOut removes auth listener and returns UI to Google sign-in screen', async () => {
    let authSignedOut = false;
    const ctx = createBootstrapContext({});
    ctx.CollabAuth.signOutUser = async () => { authSignedOut = true; };

    // Start collab bootstrap
    ctx.CollabBootstrap.start();
    assert.ok(ctx._authCallback, 'Auth listener was attached');

    // Trigger uninvited state
    ctx.CollabBootstrap.showCollabLockScreen('uninvited');
    const uninvitedCard = ctx.elements['collab-uninvited-card'];
    const signinBtn = ctx.elements['collab-google-signin-btn'];
    assert.equal(uninvitedCard.classList.contains('hidden'), false);
    assert.equal(signinBtn.classList.contains('hidden'), true);

    // Call signOut
    await ctx.CollabBootstrap.signOut();
    assert.equal(authSignedOut, true, 'CollabAuth.signOutUser must be called');
    assert.equal(ctx._authUnsubscribed, true, 'Auth listener must be unsubscribed');
    assert.equal(uninvitedCard.classList.contains('hidden'), true, 'Uninvited card must be hidden');
    assert.equal(signinBtn.classList.contains('hidden'), false, 'Google sign-in button must be restored');
});

test('index.html contains static Google sign-in button and "Ask an owner for an invite" with data-onclick', () => {
    const html = read('index.html');
    assert.match(html, /id="collab-google-signin-btn"/, 'Must contain static collab-google-signin-btn');
    assert.match(html, /data-onclick="collabSignInWithGoogle\(\)"/, 'Sign-in button must use data-onclick');
    assert.match(html, /Ask an owner for an invite/, 'Must contain the exact string "Ask an owner for an invite"');
    assert.match(html, /data-onclick="collabSignOut\(\)"/, 'Sign-out button must use data-onclick');
    assert.doesNotMatch(html, /(?<!data-)onclick="collab/i, 'Must not use native inline onclick');
});

test('network or other non-permission errors during meta/team get display error state and never show uninvited card', async () => {
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    if (colName === 'meta' && docId === 'team') {
                        const err = new Error('14 UNAVAILABLE: network transport failed');
                        err.code = 'unavailable';
                        throw err;
                    }
                    return { exists: false, data: () => null };
                }
            })
        })
    };

    const ctx = createBootstrapContext(firestoreMock);
    const user = { uid: 'user-net-err', email: 'user@example.com' };

    // initTeamUser must propagate non-permission-denied errors
    await assert.rejects(
        () => ctx.CollabBootstrap.initTeamUser(user),
        /unavailable|network transport failed/
    );

    // When handleUserAuth catches a network failure, it displays error state
    await ctx.CollabBootstrap.handleUserAuth(user);
    const uninvitedCard = ctx.elements['collab-uninvited-card'];
    const signinBtn = ctx.elements['collab-google-signin-btn'];
    const hint = ctx.elements['lock-screen-hint'];

    assert.equal(uninvitedCard.classList.contains('hidden'), true, 'Uninvited card must remain hidden on network error');
    assert.equal(signinBtn.classList.contains('hidden'), false, 'Google sign-in button remains available');
    assert.match(hint.textContent, /network transport failed|failed to connect/i);
});

test('start() concludes redirect result without triggering handleUserAuth directly', async () => {
    let redirectResolved = false;
    let authHandled = false;

    const ctx = createBootstrapContext({});
    ctx.CollabAuth.getRedirectResult = async () => {
        redirectResolved = true;
        return { user: { uid: 'redirect-user', email: 'redirect@example.com' } };
    };

    // Override handleUserAuth to detect if getRedirectResult directly invokes it
    const originalHandle = ctx.CollabBootstrap.handleUserAuth;
    ctx.CollabBootstrap.handleUserAuth = async (user) => {
        authHandled = true;
        return originalHandle(user);
    };
    ctx.CollabBootstrap.start();
    await new Promise(r => setTimeout(r, 10));

    assert.equal(redirectResolved, true, 'getRedirectResult was called to conclude redirect flow');
    assert.equal(authHandled, false, 'getRedirectResult must NOT call handleUserAuth directly');
});

test('network errors reading members or invites propagate and display error state without showing uninvited card', async () => {
    // 1. Network error on members/{uid}
    const store = new Map([['meta/team', { ownerUid: 'owner-1', initialized: true }]]);
    const firestoreMockMemberError = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    if (colName === 'meta' && docId === 'team') return { exists: true, data: () => store.get('meta/team') };
                    if (colName === 'members') {
                        const err = new Error('14 UNAVAILABLE: member transport error');
                        err.code = 'unavailable';
                        throw err;
                    }
                    return { exists: false, data: () => null };
                }
            })
        })
    };

    const ctxMember = createBootstrapContext(firestoreMockMemberError);
    const userMember = { uid: 'user-member-err', email: 'member_err@example.com' };

    await assert.rejects(
        () => ctxMember.CollabBootstrap.initTeamUser(userMember),
        /member transport error/
    );
    await ctxMember.CollabBootstrap.handleUserAuth(userMember);
    assert.equal(ctxMember.elements['collab-uninvited-card'].classList.contains('hidden'), true);
    assert.match(ctxMember.elements['lock-screen-hint'].textContent, /member transport error|failed to connect/i);

    // 2. Network error on invites/{email}
    const firestoreMockInviteError = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    if (colName === 'meta' && docId === 'team') return { exists: true, data: () => store.get('meta/team') };
                    if (colName === 'members') return { exists: false, data: () => null };
                    if (colName === 'invites') {
                        const err = new Error('14 UNAVAILABLE: invite transport error');
                        err.code = 'unavailable';
                        throw err;
                    }
                    return { exists: false, data: () => null };
                }
            })
        })
    };

    const ctxInvite = createBootstrapContext(firestoreMockInviteError);
    const userInvite = { uid: 'user-invite-err', email: 'invite_err@example.com' };

    await assert.rejects(
        () => ctxInvite.CollabBootstrap.initTeamUser(userInvite),
        /invite transport error/
    );
    await ctxInvite.CollabBootstrap.handleUserAuth(userInvite);
    assert.equal(ctxInvite.elements['collab-uninvited-card'].classList.contains('hidden'), true);
    assert.match(ctxInvite.elements['lock-screen-hint'].textContent, /invite transport error|failed to connect/i);
});

test('index.html layout and dynamic script loading contract in events.js', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon128\.png">/);
    assert.match(html, /<link href="vendor\/fontawesome\/css\/all\.min\.css" rel="stylesheet">/);
    assert.doesNotMatch(html, /@import\s+["']vendor\/fontawesome/);
    assert.doesNotMatch(html, /<script[^>]+src="js\/collab-config\.js"/);
    assert.doesNotMatch(html, /<script[^>]+src="js\/collab-bootstrap\.js"/);

    const events = read('js/events.js');
    assert.match(events, /js\/collab-config\.js/);
    assert.match(events, /window\.COLLAB_MODE/);
    assert.match(events, /CollabBootstrap\?\.start/);
});

test('promise of enablePersistence resolves before meta/team is retrieved via get()', async () => {
    let persistenceResolved = false;
    let getCalledAfterPersistence = false;
    let persistenceDbPassed = null;

    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    if (colName === 'meta' && docId === 'team') {
                        getCalledAfterPersistence = persistenceResolved;
                    }
                    return { exists: true, data: () => ({ initialized: true, ownerUid: 'someone' }) };
                },
                set: async () => {}
            })
        })
    };

    const ctx = createBootstrapContext(firestoreMock);
    ctx.CollabStore = {
        enableOfflinePersistence: async (db) => {
            persistenceDbPassed = db;
            await new Promise(r => setTimeout(r, 10));
            persistenceResolved = true;
        }
    };

    const user = { uid: 'user-1', email: 'u1@example.com' };
    try {
        await ctx.CollabBootstrap.initTeamUser(user);
    } catch (_) {}

    assert.equal(persistenceDbPassed, firestoreMock, 'db must be passed to enableOfflinePersistence');
    assert.equal(getCalledAfterPersistence, true, 'meta/team get() must be called strictly after enableOfflinePersistence resolves');
});

function createDOMBootstrapContext(firestoreMock = {}) {
    const elementsById = new Map();

    class FakeElement {
        constructor(tag, id = '') {
            this.tagName = tag.toUpperCase();
            this._id = '';
            this.attributes = new Map();
            this.style = {};
            this.children = [];
            this.parentNode = null;
            this._innerHTML = '';
            this._textContent = '';
            this.dataset = {};
            this.classList = {
                _classes: new Set(),
                add(c) { this._classes.add(c); },
                remove(c) { this._classes.delete(c); },
                contains(c) { return this._classes.has(c); }
            };
            if (id) this.id = id;
        }

        get id() { return this._id; }
        set id(val) {
            if (this._id) elementsById.delete(this._id);
            this._id = val ? String(val) : '';
            if (this._id) elementsById.set(this._id, this);
        }

        setAttribute(name, val) {
            this.attributes.set(name, String(val));
            if (name === 'id') {
                this.id = val;
            }
            if (name.startsWith('data-')) {
                const prop = name.slice(5);
                this.dataset[prop] = String(val);
            }
        }
        getAttribute(name) { return this.attributes.get(name) || null; }
        hasAttribute(name) { return this.attributes.has(name); }
        removeAttribute(name) {
            this.attributes.delete(name);
            if (name === 'id') { this.id = ''; }
        }

        get title() { return this.getAttribute('title') || ''; }
        set title(v) { this.setAttribute('title', v); }

        get className() { return this.getAttribute('class') || ''; }
        set className(v) { this.setAttribute('class', v); }

        get firstChild() { return this.children[0] || null; }

        appendChild(child) {
            if (child.parentNode) child.remove();
            child.parentNode = this;
            this.children.push(child);
            return child;
        }

        insertBefore(newChild, refChild) {
            if (newChild.parentNode) newChild.remove();
            newChild.parentNode = this;
            const idx = this.children.indexOf(refChild);
            if (idx === -1) this.children.push(newChild);
            else this.children.splice(idx, 0, newChild);
            return newChild;
        }

        removeChild(child) {
            const idx = this.children.indexOf(child);
            if (idx !== -1) {
                this.children.splice(idx, 1);
                child.parentNode = null;
                if (child.id) elementsById.delete(child.id);
            }
            return child;
        }

        remove() {
            if (this.parentNode) {
                this.parentNode.removeChild(this);
            } else if (this.id) {
                elementsById.delete(this.id);
            }
        }

        get textContent() {
            if (this.children.length === 0) return this._textContent;
            return this.children.map(c => c.textContent).join('');
        }
        set textContent(v) {
            this.children = [];
            this._textContent = v;
        }

        get innerHTML() {
            return this._innerHTML;
        }
        set innerHTML(html) {
            this._innerHTML = html;
            this._textContent = html
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        get innerText() { return this.textContent; }
        set innerText(v) { this.textContent = v; }

        get disabled() { return this.hasAttribute('disabled') || Boolean(this._disabled); }
        set disabled(v) {
            this._disabled = Boolean(v);
            if (v) this.setAttribute('disabled', '');
            else this.removeAttribute('disabled');
        }

        get draggable() { return this.getAttribute('draggable') === 'true'; }
        set draggable(v) { this.setAttribute('draggable', String(v)); }

        closest(sel) {
            let curr = this;
            while (curr) {
                if (matchSel(curr, sel)) return curr;
                curr = curr.parentNode;
            }
            return null;
        }

        querySelector(sel) {
            for (const child of this.children) {
                if (matchSel(child, sel)) return child;
                const found = child.querySelector(sel);
                if (found) return found;
            }
            return null;
        }

        querySelectorAll(sel) {
            const res = [];
            for (const child of this.children) {
                if (matchSel(child, sel)) res.push(child);
                res.push(...child.querySelectorAll(sel));
            }
            return res;
        }
    }

    function matchSel(el, sel) {
        if (!el || !sel) return false;
        sel = sel.trim();
        if (sel.includes(',')) return sel.split(',').some(s => matchSel(el, s));
        if (sel.startsWith('#')) return el.id === sel.slice(1);
        if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
        if (sel.startsWith('[') && sel.endsWith(']')) {
            const inner = sel.slice(1, -1);
            const eq = inner.indexOf('=');
            if (eq === -1) return el.hasAttribute(inner);
            const attr = inner.slice(0, eq);
            let val = inner.slice(eq + 1);
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            return el.getAttribute(attr) === val;
        }
        return el.tagName === sel.toUpperCase();
    }

    const docListeners = [];
    const windowListeners = [];

    function dispatchDOMEvent(e) {
        let stopped = false;
        let immediateStopped = false;
        e.preventDefault = () => { e.defaultPrevented = true; };
        e.stopPropagation = () => { stopped = true; };
        e.stopImmediatePropagation = () => { stopped = true; immediateStopped = true; };

        // 1. Window capture
        for (const l of [...windowListeners]) {
            if (l.type === e.type && l.capture && !immediateStopped) l.fn(e);
        }
        if (stopped) return;

        // 2. Document capture
        for (const l of [...docListeners]) {
            if (l.type === e.type && l.capture && !immediateStopped) l.fn(e);
        }
        if (stopped) return;

        // 3. Document bubble
        for (const l of [...docListeners]) {
            if (l.type === e.type && !l.capture && !immediateStopped) l.fn(e);
        }
        if (stopped) return;

        // 4. Window bubble
        for (const l of [...windowListeners]) {
            if (l.type === e.type && !l.capture && !immediateStopped) l.fn(e);
        }
    }

    FakeElement.prototype.dispatchEvent = function(e) {
        e.target = this;
        dispatchDOMEvent(e);
        return !e.defaultPrevented;
    };
    FakeElement.prototype.click = function() {
        this.dispatchEvent({ type: 'click' });
    };

    const footer = new FakeElement('div', 'sidebar-footer');
    const grid = new FakeElement('div');
    const lockBtn = new FakeElement('button');
    lockBtn.setAttribute('data-onclick', 'lockVault()');
    lockBtn.setAttribute('title', 'Lock vault');
    const lockIcon = new FakeElement('i');
    lockIcon.className = 'fa-solid fa-lock-open';
    const lockSpan = new FakeElement('span');
    lockSpan.textContent = 'Lock';
    lockBtn.appendChild(lockIcon);
    lockBtn.appendChild(lockSpan);
    grid.appendChild(lockBtn);
    footer.appendChild(grid);

    const lockScreen = new FakeElement('div', 'lock-screen');
    const signinBtn = new FakeElement('button', 'collab-google-signin-btn');
    const uninvitedCard = new FakeElement('div', 'collab-uninvited-card');
    uninvitedCard.classList.add('hidden');
    lockScreen.appendChild(signinBtn);
    lockScreen.appendChild(uninvitedCard);

    const debugErr = new FakeElement('div', 'debug-err');
    debugErr.style.display = 'none';

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        COLLAB_MODE: true,
        document: {
            getElementById: (id) => elementsById.get(id) || null,
            querySelector: (sel) => {
                if (sel === '#sidebar-footer [data-onclick="lockVault()"]') return lockBtn.getAttribute('data-onclick') === 'lockVault()' ? lockBtn : null;
                if (sel === '#sidebar-footer [data-onclick="collabSignOut()"]') return lockBtn.getAttribute('data-onclick') === 'collabSignOut()' ? lockBtn : null;
                if (sel === '#collab-me') return elementsById.get('collab-me') || null;
                return null;
            },
            querySelectorAll: (sel) => {
                const res = [];
                for (const el of elementsById.values()) {
                    if (matchSel(el, sel)) res.push(el);
                    res.push(...el.querySelectorAll(sel));
                }
                return [...new Set(res)];
            },
            createElement: (tag) => new FakeElement(tag),
            addEventListener: (type, fn, opts) => {
                const capture = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
                docListeners.push({ type, fn, capture });
            },
            dispatchEvent: (e) => {
                if (!e.target) e.target = ctx.document;
                dispatchDOMEvent(e);
                return !e.defaultPrevented;
            }
        },
        elementsById,
        lockBtn,
        lockIcon,
        lockSpan,
        footer,
        _toasts: [],
        toast: (msg, type = 'info') => {
            ctx._toasts.push({ msg, type });
        },
        addEventListener: (type, fn, opts) => {
            const capture = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
            windowListeners.push({ type, fn, capture });
        },
        dispatchEvent: (e) => {
            if (!e.target) e.target = ctx;
            dispatchDOMEvent(e);
            return !e.defaultPrevented;
        },
        firebase: {
            firestore: () => firestoreMock
        },
        ensureFirebase: () => Promise.resolve(),
        CollabAuth: {
            signOutUser: async () => {},
            signInWithGoogle: async () => {},
            getRedirectResult: async () => null,
            onAuthChanged: (cb) => {
                ctx._authCallback = cb;
                return () => { ctx._authUnsubscribed = true; };
            }
        },
        CollabStore: {
            enableOfflinePersistence: async () => {},
            stopListening: () => { ctx._stoppedListening = true; }
        },
        startApp: async () => { ctx._appStarted = true; },
        location: { hostname: 'docvault-qa-team.firebaseapp.com', search: '' }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    // Simulate events.js bubbling unhandledrejection
    ctx.addEventListener('unhandledrejection', function(e) {
        const el = ctx.document.getElementById('debug-err');
        if (el) { el.style.display = 'block'; el.innerText += '\nPromise Error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason); }
    });

    // Simulate events.js bubbling click listener with executeAction
    ctx.document.addEventListener('click', function(e) {
        let target = (e.target && typeof e.target.closest === 'function') ? e.target.closest('[data-onclick]') : null;
        if (target) {
            const code = target.getAttribute('data-onclick');
            const m = code.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
            if (m && typeof ctx[m[1]] === 'function') {
                ctx[m[1]]();
            }
        }
    });

    vm.createContext(ctx);
    const source = read('js/collab-bootstrap.js');
    vm.runInContext(source, ctx);
    const viewerSource = read('js/collab-viewer.js');
    vm.runInContext(viewerSource, ctx);
    return ctx;
}

test('team edition mutates Lock button to Sign out without calling lockVault()', () => {
    const ctx = createDOMBootstrapContext({});
    assert.equal(ctx.lockBtn.getAttribute('data-onclick'), 'lockVault()');
    assert.equal(ctx.lockBtn.title, 'Lock vault');
    assert.equal(ctx.lockSpan.textContent, 'Lock');

    // Run start()
    ctx.CollabBootstrap.start();

    // Verify button was mutated to Sign out
    assert.notEqual(ctx.lockBtn.getAttribute('data-onclick'), 'lockVault()');
    assert.equal(ctx.lockBtn.getAttribute('data-onclick'), 'collabSignOut()');
    assert.equal(ctx.lockBtn.getAttribute('title'), 'Sign out');
    assert.equal(ctx.lockBtn.title, 'Sign out');
    assert.equal(ctx.lockSpan.textContent, 'Sign out');
    assert.equal(ctx.lockIcon.className, 'fa-solid fa-right-from-bracket');
});

test('#collab-me row renders name, email, role badge, and https:// photo at top of sidebar-footer', async () => {
    const store = new Map();
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return { exists: store.has(key), data: () => store.get(key) || null };
                },
                set: async (data) => { store.set(`${colName}/${docId}`, data); },
                delete: async () => { store.delete(`${colName}/${docId}`); }
            })
        })
    };

    const ctx = createDOMBootstrapContext(firestoreMock);
    const user = {
        uid: 'owner-uid-1',
        email: 'alice@example.com',
        displayName: 'Alice Wonderland',
        photoURL: 'https://cdn.example.com/avatars/alice.jpg'
    };

    // Authenticate user as owner
    await ctx.CollabBootstrap.handleUserAuth(user);

    // Verify #collab-me row was inserted at the very top of #sidebar-footer
    const collabMe = ctx.document.getElementById('collab-me');
    assert.ok(collabMe, '#collab-me row must be created in DOM');
    assert.equal(ctx.footer.firstChild, collabMe, '#collab-me must be the first child of #sidebar-footer');

    // Verify content: name, email, role badge, and image
    assert.match(collabMe.innerHTML, /Alice Wonderland/, 'Must display user name');
    assert.match(collabMe.innerHTML, /alice@example\.com/, 'Must display email');
    assert.match(collabMe.innerHTML, />Owner</, 'Must display capitalized Owner badge');
    assert.match(collabMe.innerHTML, /<img\s+src="https:\/\/cdn\.example\.com\/avatars\/alice\.jpg"/, 'Must render img with https:// photoURL');

    // Verify photoURL is NOT saved to Firestore
    const savedMember = store.get('members/owner-uid-1');
    assert.ok(savedMember);
    assert.equal(savedMember.photoURL, undefined, 'photoURL must NEVER be written to Firestore');
});

test('#collab-me falls back to initial letter when photoURL is missing or not https://', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }],
        ['members/editor-1', { uid: 'editor-1', email: 'bob@example.com', displayName: 'Bob Ross', role: 'editor' }]
    ]);
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return { exists: store.has(key), data: () => store.get(key) || null };
                }
            })
        })
    };

    // Test with non-https photoURL (e.g. http:// or javascript:)
    const ctx = createDOMBootstrapContext(firestoreMock);
    const userWithInsecurePhoto = {
        uid: 'editor-1',
        email: 'bob@example.com',
        displayName: 'Bob Ross',
        photoURL: 'http://insecure.example.com/avatar.jpg'
    };

    await ctx.CollabBootstrap.handleUserAuth(userWithInsecurePhoto);

    const collabMe = ctx.document.getElementById('collab-me');
    assert.ok(collabMe);
    assert.doesNotMatch(collabMe.innerHTML, /<img/, 'Must NOT render <img> for non-https photoURL');
    assert.match(collabMe.innerHTML, />B</, 'Must render initial B of name Bob Ross');
    assert.match(collabMe.innerHTML, />Editor</, 'Must display capitalized Editor badge');
});

test('#collab-me row is removed upon collabSignOut()', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }],
        ['members/viewer-1', { uid: 'viewer-1', email: 'viewer@example.com', displayName: 'View Only', role: 'viewer' }]
    ]);
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return { exists: store.has(key), data: () => store.get(key) || null };
                }
            })
        })
    };

    const ctx = createDOMBootstrapContext(firestoreMock);
    const user = { uid: 'viewer-1', email: 'viewer@example.com', displayName: 'View Only' };

    await ctx.CollabBootstrap.handleUserAuth(user);
    assert.ok(ctx.document.getElementById('collab-me'), 'Must be rendered after auth');

    // Call collabSignOut
    await ctx.collabSignOut();

    // Verify #collab-me was removed
    assert.equal(ctx.document.getElementById('collab-me'), null, '#collab-me must be removed after sign out');
    assert.equal(ctx.CollabBootstrap.getCurrentMember(), null, 'Member state must be cleared');
});

test('#collab-me row is removed when uninvited, null user, or auth error', async () => {
    let throwOnGet = false;
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    if (throwOnGet) throw new Error('Firestore read failure');
                    if (colName === 'meta' && docId === 'team') return { exists: true, data: () => ({ initialized: true, ownerUid: 'owner-1' }) };
                    return { exists: false, data: () => null };
                },
                set: async () => {}
            })
        })
    };

    const ctx = createDOMBootstrapContext(firestoreMock);

    // 1. Uninvited stranger
    ctx.CollabBootstrap.renderCollabMe({ email: 'test@example.com' }, { role: 'editor' });
    assert.ok(ctx.document.getElementById('collab-me'));
    await ctx.CollabBootstrap.handleUserAuth({ uid: 'stranger', email: 'stranger@example.com' });
    assert.equal(ctx.document.getElementById('collab-me'), null, 'Must remove on uninvited user');

    // 2. null user
    ctx.CollabBootstrap.renderCollabMe({ email: 'test@example.com' }, { role: 'editor' });
    assert.ok(ctx.document.getElementById('collab-me'));
    await ctx.CollabBootstrap.handleUserAuth(null);
    assert.equal(ctx.document.getElementById('collab-me'), null, 'Must remove on null user');

    // 3. Auth / network error
    ctx.CollabBootstrap.renderCollabMe({ email: 'test@example.com' }, { role: 'editor' });
    assert.ok(ctx.document.getElementById('collab-me'));
    throwOnGet = true;
    await ctx.CollabBootstrap.handleUserAuth({ uid: 'err-user', email: 'err@example.com' });
    assert.equal(ctx.document.getElementById('collab-me'), null, 'Must remove on auth error');
});

test('hostile characters in displayName and email are escaped in #collab-me', async () => {
    const ctx = createDOMBootstrapContext({});
    const hostileUser = {
        uid: 'xss-user',
        email: '<script>alert("xss")</script>@example.com',
        displayName: 'Evil <img src=x onerror=alert(1)>',
        photoURL: 'https://example.com/safe.png'
    };
    const hostileMember = {
        role: 'editor',
        displayName: 'Evil <img src=x onerror=alert(1)>',
        email: '<script>alert("xss")</script>@example.com'
    };

    ctx.CollabBootstrap.renderCollabMe(hostileUser, hostileMember);
    const collabMe = ctx.document.getElementById('collab-me');
    assert.ok(collabMe);

    // Hostile tags must NOT be present raw
    assert.doesNotMatch(collabMe.innerHTML, /<script>/i);
    assert.doesNotMatch(collabMe.innerHTML, /<img src=x/i);
    assert.match(collabMe.innerHTML, /&lt;script&gt;/);
    assert.match(collabMe.innerHTML, /&lt;img src=x/);
});

test('Phase 15: viewer role disables writing buttons and blocks actions at capture phase before executeAction', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }],
        ['members/viewer-1', { uid: 'viewer-1', email: 'viewer@example.com', displayName: 'Viewer One', role: 'viewer' }]
    ]);
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return { exists: store.has(key), data: () => store.get(key) || null };
                }
            })
        })
    };

    const ctx = createDOMBootstrapContext(firestoreMock);

    const actionsToBlock = [
        'showTemplateModal()',
        'editDoc("doc-1")',
        'duplicateDoc("doc-1")',
        'showDeleteModal("doc-1")',
        'showEmptyTrashModal()',
        'emptyTrash()',
        'confirmDelete("doc-1")',
        'hardDeleteDoc("doc-1")',
        'restoreDoc("doc-1")',
        'saveDoc()',
        'shareDoc("doc-1")',
        'confirmBatchDelete()',
        'confirmBatchAddTag()',
        'confirmBatchMoveFolder()',
        'confirmBatchBugEdit()',
        'saveFocusWorkflow()',
        'completeFocusItem("doc-1")',
        'unsnoozeFocusItem("doc-1")',
        'reopenFocusItem("doc-1")'
    ];

    const blockedBtns = [];
    for (let i = 0; i < actionsToBlock.length; i++) {
        const btn = ctx.document.createElement('button');
        btn.id = `btn-blocked-${i}`;
        btn.setAttribute('data-onclick', actionsToBlock[i]);
        ctx.elementsById.set(btn.id, btn);
        blockedBtns.push(btn);
    }

    const kanbanCard = ctx.document.createElement('div');
    kanbanCard.id = 'kanban-card-1';
    kanbanCard.setAttribute('draggable', 'true');
    ctx.elementsById.set(kanbanCard.id, kanbanCard);

    const allowedActions = [
        'viewDoc("doc-1")',
        'switchWorkspace("default")',
        'showGitHubSettingsModal()',
        'collabSignOut()',
        'closeModal()'
    ];
    const allowedBtns = [];
    for (let i = 0; i < allowedActions.length; i++) {
        const btn = ctx.document.createElement('button');
        btn.id = `btn-allowed-${i}`;
        btn.setAttribute('data-onclick', allowedActions[i]);
        ctx.elementsById.set(btn.id, btn);
        allowedBtns.push(btn);
    }

    let showTemplateModalCalled = false;
    let editDocCalled = false;
    let showDeleteModalCalled = false;
    let viewDocCalled = false;
    let switchWorkspaceCalled = false;
    let showGitHubSettingsModalCalled = false;
    let closeModalCalled = false;

    ctx.showTemplateModal = () => { showTemplateModalCalled = true; };
    ctx.editDoc = () => { editDocCalled = true; };
    ctx.showDeleteModal = () => { showDeleteModalCalled = true; };
    ctx.viewDoc = () => { viewDocCalled = true; };
    ctx.switchWorkspace = () => { switchWorkspaceCalled = true; };
    ctx.showGitHubSettingsModal = () => { showGitHubSettingsModalCalled = true; };
    ctx.closeModal = () => { closeModalCalled = true; };

    await ctx.CollabBootstrap.handleUserAuth({ uid: 'viewer-1', email: 'viewer@example.com' });

    for (const btn of blockedBtns) {
        assert.equal(btn.disabled, true, `${btn.getAttribute('data-onclick')} must be disabled`);
        assert.equal(btn.getAttribute('aria-disabled'), 'true', `${btn.getAttribute('data-onclick')} must have aria-disabled="true"`);
        assert.equal(btn.getAttribute('title'), 'You have view access', `${btn.getAttribute('data-onclick')} must have title="You have view access"`);
        assert.equal(btn.title, 'You have view access');
    }

    assert.equal(kanbanCard.getAttribute('draggable'), 'false', 'Kanban card must have draggable="false"');
    assert.equal(kanbanCard.draggable, false);

    for (const btn of allowedBtns) {
        assert.equal(btn.disabled, false, `${btn.getAttribute('data-onclick')} must not be disabled`);
        assert.equal(btn.hasAttribute('aria-disabled'), false, `${btn.getAttribute('data-onclick')} must not have aria-disabled`);
    }

    ctx._toasts = [];
    const templateBtn = blockedBtns.find(b => b.getAttribute('data-onclick') === 'showTemplateModal()');
    templateBtn.click();
    assert.equal(showTemplateModalCalled, false, 'showTemplateModal must NOT be called by viewer click');
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'), 'Must toast "You have view access"');

    ctx._toasts = [];
    const editBtn = blockedBtns.find(b => b.getAttribute('data-onclick') === 'editDoc("doc-1")');
    editBtn.click();
    assert.equal(editDocCalled, false, 'editDoc must NOT be called by viewer click');
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'));

    ctx._toasts = [];
    const deleteBtn = blockedBtns.find(b => b.getAttribute('data-onclick') === 'showDeleteModal("doc-1")');
    deleteBtn.click();
    assert.equal(showDeleteModalCalled, false, 'showDeleteModal must NOT be called by viewer click');
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'));

    ctx._toasts = [];
    allowedBtns[0].click();
    assert.equal(viewDocCalled, true, 'viewDoc MUST be called');
    assert.equal(ctx._toasts.length, 0);

    allowedBtns[1].click();
    assert.equal(switchWorkspaceCalled, true, 'switchWorkspace MUST be called');

    allowedBtns[2].click();
    assert.equal(showGitHubSettingsModalCalled, true, 'showGitHubSettingsModal MUST be called');

    allowedBtns[4].click();
    assert.equal(closeModalCalled, true, 'closeModal MUST be called');

    let renderCount = 0;
    ctx.render = () => { renderCount++; };
    ctx.CollabViewer.patchRender();

    const lateBtn = ctx.document.createElement('button');
    lateBtn.id = 'late-btn-1';
    lateBtn.setAttribute('data-onclick', 'showTemplateModal()');
    ctx.elementsById.set(lateBtn.id, lateBtn);

    ctx.render();
    assert.equal(renderCount, 1);
    assert.equal(lateBtn.disabled, true, 'Dynamically rendered button must be disabled after render()');
    assert.equal(lateBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(lateBtn.getAttribute('title'), 'You have view access');
});

test('Phase 15: editor and owner roles and personal edition are NOT disabled and can call actions', async () => {
    const store = new Map([
        ['meta/team', { ownerUid: 'owner-1', initialized: true }],
        ['members/editor-1', { uid: 'editor-1', email: 'editor@example.com', displayName: 'Editor One', role: 'editor' }]
    ]);
    const firestoreMock = {
        collection: (colName) => ({
            doc: (docId) => ({
                get: async () => {
                    const key = `${colName}/${docId}`;
                    return { exists: store.has(key), data: () => store.get(key) || null };
                }
            })
        })
    };

    const ctx = createDOMBootstrapContext(firestoreMock);

    const templateBtn = ctx.document.createElement('button');
    templateBtn.id = 'btn-template';
    templateBtn.setAttribute('data-onclick', 'showTemplateModal()');
    ctx.elementsById.set(templateBtn.id, templateBtn);

    const editBtn = ctx.document.createElement('button');
    editBtn.id = 'btn-edit';
    editBtn.setAttribute('data-onclick', 'editDoc("doc-1")');
    ctx.elementsById.set(editBtn.id, editBtn);

    const deleteBtn = ctx.document.createElement('button');
    deleteBtn.id = 'btn-delete';
    deleteBtn.setAttribute('data-onclick', 'showDeleteModal("doc-1")');
    ctx.elementsById.set(deleteBtn.id, deleteBtn);

    const kanbanCard = ctx.document.createElement('div');
    kanbanCard.id = 'card-edit';
    kanbanCard.setAttribute('draggable', 'true');
    ctx.elementsById.set(kanbanCard.id, kanbanCard);

    let templateCalled = false;
    let editCalled = false;
    let deleteCalled = false;
    ctx.showTemplateModal = () => { templateCalled = true; };
    ctx.editDoc = () => { editCalled = true; };
    ctx.showDeleteModal = () => { deleteCalled = true; };

    await ctx.CollabBootstrap.handleUserAuth({ uid: 'editor-1', email: 'editor@example.com' });

    assert.equal(templateBtn.disabled, false);
    assert.equal(templateBtn.hasAttribute('aria-disabled'), false);
    assert.equal(editBtn.disabled, false);
    assert.equal(deleteBtn.disabled, false);
    assert.equal(kanbanCard.getAttribute('draggable'), 'true');

    templateBtn.click();
    assert.equal(templateCalled, true, 'Editor can call showTemplateModal()');

    editBtn.click();
    assert.equal(editCalled, true, 'Editor can call editDoc()');

    deleteBtn.click();
    assert.equal(deleteCalled, true, 'Editor can call showDeleteModal()');

    assert.equal(ctx._toasts.length, 0, 'No view access toast for editor');

    ctx.COLLAB_MODE = false;
    ctx.CollabViewer.applyViewerRestrictions();
    assert.equal(templateBtn.disabled, false);
    assert.equal(kanbanCard.getAttribute('draggable'), 'true');
});

test('Phase 15: banner #debug-err does not receive permission-denied error or turn on display', async () => {
    const ctx = createDOMBootstrapContext({});
    const debugErr = ctx.document.getElementById('debug-err');
    assert.ok(debugErr);
    assert.equal(debugErr.style.display, 'none');
    assert.equal(debugErr.innerText, '');

    // 1. Permission-denied error code and message
    const permDeniedEvent = {
        type: 'unhandledrejection',
        reason: {
            code: 'permission-denied',
            message: 'Missing or insufficient permissions.'
        }
    };
    ctx.dispatchEvent(permDeniedEvent);

    assert.equal(debugErr.style.display, 'none', '#debug-err must NOT have display: block on permission-denied');
    assert.doesNotMatch(debugErr.innerText, /Missing or insufficient permissions/, '#debug-err must not contain permission error text');
    assert.doesNotMatch(debugErr.innerText, /permission-denied/);

    // 2. Code 7 / PERMISSION_DENIED message
    const permDeniedEvent2 = {
        type: 'unhandledrejection',
        reason: new Error('7 PERMISSION_DENIED: false for \'delete\' @ L45')
    };
    ctx.dispatchEvent(permDeniedEvent2);
    assert.equal(debugErr.style.display, 'none');
    assert.doesNotMatch(debugErr.innerText, /PERMISSION_DENIED/);

    // 3. Unrelated error -> should be shown
    const networkErrorEvent = {
        type: 'unhandledrejection',
        reason: new Error('Network transport failed')
    };
    ctx.dispatchEvent(networkErrorEvent);
    assert.equal(debugErr.style.display, 'block', '#debug-err MUST show unrelated errors');
    assert.match(debugErr.innerText, /Network transport failed/);
});



