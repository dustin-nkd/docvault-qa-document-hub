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

