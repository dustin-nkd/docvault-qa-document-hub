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

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        document: {
            getElementById: (id) => elementsById.get(id) || null,
            querySelector: (sel) => {
                if (sel === '#sidebar-footer [data-onclick="lockVault()"]') return lockBtn.getAttribute('data-onclick') === 'lockVault()' ? lockBtn : null;
                if (sel === '#sidebar-footer [data-onclick="collabSignOut()"]') return lockBtn.getAttribute('data-onclick') === 'collabSignOut()' ? lockBtn : null;
                if (sel === '#collab-me') return elementsById.get('collab-me') || null;
                return null;
            },
            createElement: (tag) => new FakeElement(tag)
        },
        elementsById,
        lockBtn,
        lockIcon,
        lockSpan,
        footer,
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

    const source = read('js/collab-bootstrap.js');
    vm.runInNewContext(source, ctx);
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



