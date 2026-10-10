import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'docvault-qa-team';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules }
    });
});

after(async () => {
    if (testEnv) {
        await testEnv.cleanup();
    }
});

beforeEach(async () => {
    if (testEnv) {
        await testEnv.clearFirestore();
    }
});

// Helper to seed fixtures with security rules bypassed
async function seed(fn) {
    await testEnv.withSecurityRulesDisabled(fn);
}

// ---------------------------------------------------------------------------
// 1. meta/team
// ---------------------------------------------------------------------------
test('Branch 1 (meta/team): allows authenticated user to get when absent, and create once with ownerUid == auth.uid', async () => {
    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' });
    const db = owner.firestore();

    // Authenticated user can get meta/team when it does not exist yet
    const preSnap = await assertSucceeds(db.collection('meta').doc('team').get());
    assert.equal(preSnap.exists, false);

    // Creates meta/team
    await assertSucceeds(db.collection('meta').doc('team').set({
        ownerUid: 'owner-uid',
        name: 'QA Vault',
        createdAt: '2026-10-08T00:00:00Z',
        initialized: true
    }));
});

test('Branch 1 (meta/team): denies stranger read after team exists, denies update and delete, and denies anonymous create', async () => {
    const unauthed = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthed.collection('meta').doc('team').set({
        ownerUid: 'anon',
        name: 'Vault',
        initialized: true
    }));

    const user = testEnv.authenticatedContext('user-1', { email: 'user1@example.com' }).firestore();
    await assertFails(user.collection('meta').doc('team').set({
        ownerUid: 'someone-else',
        name: 'Vault',
        initialized: true
    }));

    // Seed meta/team and owner member
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({
            ownerUid: 'owner-uid',
            name: 'QA Vault',
            initialized: true
        });
        await db.collection('members').doc('owner-uid').set({
            uid: 'owner-uid',
            role: 'owner'
        });
    });

    // Stranger (authenticated non-member) CANNOT read meta/team once team exists
    const stranger = testEnv.authenticatedContext('stranger-uid', { email: 'stranger@example.com' }).firestore();
    await assertFails(stranger.collection('meta').doc('team').get());

    // Anonymous cannot read
    await assertFails(unauthed.collection('meta').doc('team').get());

    // Member CAN read meta/team
    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();
    const snap = await assertSucceeds(owner.collection('meta').doc('team').get());
    assert.equal(snap.data().ownerUid, 'owner-uid');

    // Duplicate creation is denied
    await assertFails(user.collection('meta').doc('team').set({
        ownerUid: 'user-1',
        name: 'Duplicate',
        initialized: true
    }));

    // Update and delete on meta/team are strictly denied
    await assertFails(owner.collection('meta').doc('team').update({ name: 'Hacked Vault' }));
    await assertFails(owner.collection('meta').doc('team').delete());
    await assertFails(stranger.collection('meta').doc('team').update({ name: 'Hacked Vault' }));
    await assertFails(stranger.collection('meta').doc('team').delete());
});

// ---------------------------------------------------------------------------
// 2. Bootstrap owner member
// ---------------------------------------------------------------------------
test('Branch 2 (owner member bootstrap): allows user matching meta.team.ownerUid to create members/{uid} as owner', async () => {
    await seed(async (context) => {
        await context.firestore().collection('meta').doc('team').set({
            ownerUid: 'owner-uid',
            initialized: true
        });
    });

    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();
    await assertSucceeds(owner.collection('members').doc('owner-uid').set({
        uid: 'owner-uid',
        email: 'owner@example.com',
        displayName: 'Owner User',
        role: 'owner',
        createdAt: '2026-10-08T00:00:00Z',
        updatedAt: '2026-10-08T00:00:00Z'
    }));
});

test('Branch 2 (owner member bootstrap): denies creating owner member if not matching meta.team.ownerUid', async () => {
    await seed(async (context) => {
        await context.firestore().collection('meta').doc('team').set({
            ownerUid: 'real-owner-uid',
            initialized: true
        });
    });

    const impostor = testEnv.authenticatedContext('impostor-uid', { email: 'impostor@example.com' }).firestore();
    await assertFails(impostor.collection('members').doc('impostor-uid').set({
        uid: 'impostor-uid',
        email: 'impostor@example.com',
        role: 'owner'
    }));

    // Cannot create someone else's document
    const owner = testEnv.authenticatedContext('real-owner-uid').firestore();
    await assertFails(owner.collection('members').doc('other-uid').set({
        uid: 'other-uid',
        role: 'owner'
    }));
});

// ---------------------------------------------------------------------------
// 3. Accept invite and delete invite
// ---------------------------------------------------------------------------
test('Branch 3 (accept invite): allows authenticated user with matching invite to create member doc and delete invite', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('invites').doc('CollabUser@example.com').set({
            email: 'CollabUser@example.com',
            role: 'editor',
            invitedBy: 'owner-uid',
            createdAt: '2026-10-08T00:00:00Z'
        });
    });

    const invited = testEnv.authenticatedContext('collab-uid', { email: 'CollabUser@example.com' });
    const db = invited.firestore();

    await assertSucceeds(db.collection('members').doc('collab-uid').set({
        uid: 'collab-uid',
        email: 'CollabUser@example.com',
        displayName: 'Collab User',
        role: 'editor',
        createdAt: '2026-10-08T00:00:00Z',
        updatedAt: '2026-10-08T00:00:00Z'
    }));

    await assertSucceeds(db.collection('invites').doc('CollabUser@example.com').delete());
});

test('Branch 3 (accept invite): denies joining without invite, case mismatch, role mismatch, or deleting another invite', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('invites').doc('CollabUser@example.com').set({
            email: 'CollabUser@example.com',
            role: 'viewer',
            invitedBy: 'owner-uid'
        });
    });

    // Token collabuser@example.com (lowercase) cannot accept invite CollabUser@example.com (exact match required)
    const lowerCaseUser = testEnv.authenticatedContext('lower-uid', { email: 'collabuser@example.com' }).firestore();
    await assertFails(lowerCaseUser.collection('members').doc('lower-uid').set({
        uid: 'lower-uid',
        email: 'collabuser@example.com',
        role: 'viewer'
    }));

    // No invite exists for stranger
    const stranger = testEnv.authenticatedContext('stranger-uid', { email: 'stranger@example.com' }).firestore();
    await assertFails(stranger.collection('members').doc('stranger-uid').set({
        uid: 'stranger-uid',
        email: 'stranger@example.com',
        role: 'editor'
    }));

    // Role mismatch: invite is viewer, user requests editor
    const invitedViewer = testEnv.authenticatedContext('v-uid', { email: 'CollabUser@example.com' }).firestore();
    await assertFails(invitedViewer.collection('members').doc('v-uid').set({
        uid: 'v-uid',
        email: 'CollabUser@example.com',
        role: 'editor'
    }));

    // Stranger cannot delete another user's invite
    await assertFails(stranger.collection('invites').doc('CollabUser@example.com').delete());
});

// ---------------------------------------------------------------------------
// 4. Update member role
// ---------------------------------------------------------------------------
test('Branch 4 (update member role): allows owner to update member role while preserving uid and email', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', email: 'owner@example.com', role: 'owner' });
        await db.collection('members').doc('member-1').set({ uid: 'member-1', email: 'm1@example.com', role: 'viewer' });
    });

    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();
    await assertSucceeds(owner.collection('members').doc('member-1').update({
        role: 'editor'
    }));
});

test('Branch 4 (update member role): denies non-owner from updating roles, changing uid/email, or demoting owner', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', email: 'owner@example.com', role: 'owner' });
        await db.collection('members').doc('editor-1').set({ uid: 'editor-1', email: 'ed@example.com', role: 'editor' });
        await db.collection('members').doc('viewer-1').set({ uid: 'viewer-1', email: 'vw@example.com', role: 'viewer' });
    });

    const editor = testEnv.authenticatedContext('editor-1', { email: 'ed@example.com' }).firestore();
    // Non-owner cannot update roles or self-promote
    await assertFails(editor.collection('members').doc('viewer-1').update({ role: 'editor' }));
    await assertFails(editor.collection('members').doc('editor-1').update({ role: 'owner' }));

    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();
    // Cannot demote team owner
    await assertFails(owner.collection('members').doc('owner-uid').update({ role: 'editor' }));
    // Cannot change member email or uid
    await assertFails(owner.collection('members').doc('editor-1').update({ email: 'new-email@example.com' }));
});

// ---------------------------------------------------------------------------
// 5. Member read permissions
// ---------------------------------------------------------------------------
test('Branch 5 (member reads): allows member to read all hub collections', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('member-1').set({ uid: 'member-1', email: 'm1@example.com', role: 'viewer' });
        await db.collection('documents').doc('doc-1').set({ title: 'Doc', version: 1, createdBy: 'owner-uid', updatedBy: 'owner-uid' });
        await db.collection('documents').doc('doc-1').collection('history').doc('snap-1').set({ title: 'Snap', savedBy: 'owner-uid' });
        await db.collection('activity').doc('act-1').set({ action: 'create', actorUid: 'owner-uid' });
        await db.collection('counters').doc('bugs').set({ next: 10 });
        await db.collection('invites').doc('other@example.com').set({ email: 'other@example.com', role: 'viewer' });
        await db.collection('images').doc('img-1').set({ data: 'abc', byteSize: 100, createdBy: 'owner-uid', contentType: 'image/png' });
    });

    const member = testEnv.authenticatedContext('member-1', { email: 'm1@example.com' }).firestore();
    await assertSucceeds(member.collection('documents').doc('doc-1').get());
    await assertSucceeds(member.collection('documents').doc('doc-1').collection('history').doc('snap-1').get());
    await assertSucceeds(member.collection('activity').doc('act-1').get());
    await assertSucceeds(member.collection('counters').doc('bugs').get());
    await assertSucceeds(member.collection('members').doc('member-1').get());
    await assertSucceeds(member.collection('invites').doc('other@example.com').get());
    await assertSucceeds(member.collection('images').doc('img-1').get());
});

test('Branch 5 (member reads): denies non-members and anonymous users from reading history, activity, counters, members, invites, documents, images', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', email: 'owner@example.com', role: 'owner' });
        await db.collection('documents').doc('doc-1').set({ title: 'Secret', version: 1, createdBy: 'owner-uid', updatedBy: 'owner-uid' });
        await db.collection('documents').doc('doc-1').collection('history').doc('snap-1').set({ title: 'Snap', savedBy: 'owner-uid' });
        await db.collection('activity').doc('act-1').set({ action: 'create', actorUid: 'owner-uid' });
        await db.collection('counters').doc('bugs').set({ next: 10 });
        await db.collection('invites').doc('other@example.com').set({ email: 'other@example.com', role: 'viewer' });
        await db.collection('images').doc('img-1').set({ data: 'secret-img', byteSize: 100, createdBy: 'owner-uid', contentType: 'image/png' });
    });

    // Anonymous cannot read any collection
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection('documents').doc('doc-1').get());
    await assertFails(anon.collection('documents').doc('doc-1').collection('history').doc('snap-1').get());
    await assertFails(anon.collection('activity').doc('act-1').get());
    await assertFails(anon.collection('counters').doc('bugs').get());
    await assertFails(anon.collection('members').doc('owner-uid').get());
    await assertFails(anon.collection('invites').doc('other@example.com').get());
    await assertFails(anon.collection('images').doc('img-1').get());

    // Authenticated non-member (stranger) cannot read any collection
    const outsider = testEnv.authenticatedContext('outsider-uid', { email: 'outsider@example.com' }).firestore();
    await assertFails(outsider.collection('documents').doc('doc-1').get());
    await assertFails(outsider.collection('documents').doc('doc-1').collection('history').doc('snap-1').get());
    await assertFails(outsider.collection('activity').doc('act-1').get());
    await assertFails(outsider.collection('counters').doc('bugs').get());
    await assertFails(outsider.collection('members').doc('owner-uid').get());
    await assertFails(outsider.collection('invites').doc('other@example.com').get());
    await assertFails(outsider.collection('images').doc('img-1').get());
});

// ---------------------------------------------------------------------------
// 6. Create document
// ---------------------------------------------------------------------------
test('Branch 6 (create document): allows editor/owner to create document with version: 1 and valid creators', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', email: 'ed@example.com', role: 'editor' });
    });

    const editor = testEnv.authenticatedContext('ed-uid', { email: 'ed@example.com' }).firestore();
    await assertSucceeds(editor.collection('documents').doc('doc-new').set({
        id: 'doc-new',
        title: 'New Spec',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid',
        createdAt: '2026-10-08T00:00:00Z',
        updatedAt: '2026-10-08T00:00:00Z'
    }));
});

test('Branch 6 (create document): denies viewer, wrong version, or mismatched createdBy', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', email: 'ed@example.com', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', email: 'vw@example.com', role: 'viewer' });
    });

    const viewer = testEnv.authenticatedContext('vw-uid', { email: 'vw@example.com' }).firestore();
    await assertFails(viewer.collection('documents').doc('doc-vw').set({
        id: 'doc-vw',
        title: 'Viewer Doc',
        version: 1,
        createdBy: 'vw-uid',
        updatedBy: 'vw-uid'
    }));

    const editor = testEnv.authenticatedContext('ed-uid', { email: 'ed@example.com' }).firestore();
    // Cannot start with version 2
    await assertFails(editor.collection('documents').doc('doc-v2').set({
        id: 'doc-v2',
        title: 'Doc V2',
        version: 2,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid'
    }));
    // Cannot attribute createdBy to someone else
    await assertFails(editor.collection('documents').doc('doc-spoof').set({
        id: 'doc-spoof',
        title: 'Spoofed Doc',
        version: 1,
        createdBy: 'someone-else',
        updatedBy: 'ed-uid'
    }));
});

// ---------------------------------------------------------------------------
// 7. Update document
// ---------------------------------------------------------------------------
test('Branch 7 (update document): allows editor/owner to update with version incremented by exactly 1', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', email: 'ed@example.com', role: 'editor' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Version 1',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid',
            createdAt: '2026-10-08T00:00:00Z',
            updatedAt: '2026-10-08T00:00:00Z'
        });
    });

    const editor = testEnv.authenticatedContext('ed-uid', { email: 'ed@example.com' }).firestore();
    await assertSucceeds(editor.collection('documents').doc('doc-1').update({
        title: 'Version 2 Updated',
        version: 2,
        updatedBy: 'ed-uid',
        updatedAt: '2026-10-08T01:00:00Z'
    }));
});

test('Branch 7 (update document): denies viewer, version mismatch, or tampering with createdBy, createdAt, or id', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', email: 'ed@example.com', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', email: 'vw@example.com', role: 'viewer' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Doc 1',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid',
            createdAt: '2026-10-08T00:00:00Z'
        });
    });

    const viewer = testEnv.authenticatedContext('vw-uid', { email: 'vw@example.com' }).firestore();
    await assertFails(viewer.collection('documents').doc('doc-1').update({
        version: 2,
        updatedBy: 'vw-uid'
    }));

    const editor = testEnv.authenticatedContext('ed-uid', { email: 'ed@example.com' }).firestore();
    // Cannot skip version (e.g. 1 -> 3)
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 3,
        updatedBy: 'ed-uid'
    }));
    // Cannot stay on same version
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 1,
        updatedBy: 'ed-uid'
    }));
    // Cannot tamper with createdBy
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 2,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid'
    }));
    // Cannot tamper with createdAt
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 2,
        createdAt: '2026-10-09T00:00:00Z',
        updatedBy: 'ed-uid'
    }));
    // Cannot tamper with id
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 2,
        id: 'tampered-id',
        updatedBy: 'ed-uid'
    }));
    // Cannot tamper by adding workspaceId to legacy doc
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 2,
        workspaceId: 'new-ws',
        updatedBy: 'ed-uid'
    }));

    // Seed doc with workspaceId
    await seed(async (context) => {
        await context.firestore().collection('documents').doc('doc-ws').set({
            id: 'doc-ws',
            title: 'Doc WS',
            version: 1,
            workspaceId: 'mobile-qa',
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid',
            createdAt: '2026-10-08T00:00:00Z'
        });
    });

    // Cannot tamper with existing workspaceId
    await assertFails(editor.collection('documents').doc('doc-ws').update({
        version: 2,
        workspaceId: 'other-ws',
        updatedBy: 'ed-uid'
    }));

    // Preserving workspaceId succeeds
    await assertSucceeds(editor.collection('documents').doc('doc-ws').update({
        version: 2,
        workspaceId: 'mobile-qa',
        updatedBy: 'ed-uid'
    }));
});

// ---------------------------------------------------------------------------
// 8. Hard delete vs Soft delete
// ---------------------------------------------------------------------------
test('Branch 8 (delete paths): allows owner hard delete and editor soft delete (status: "deleted")', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('documents').doc('doc-soft').set({
            id: 'doc-soft',
            version: 1,
            status: 'active',
            createdBy: 'ed-uid',
            updatedBy: 'ed-uid'
        });
        await db.collection('documents').doc('doc-hard').set({
            id: 'doc-hard',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
        await db.collection('documents').doc('doc-hard').collection('history').doc('snap-1').set({ savedBy: 'owner-uid' });
        await db.collection('activity').doc('act-1').set({ actorUid: 'owner-uid' });
    });

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    // Editor soft deletes document
    await assertSucceeds(editor.collection('documents').doc('doc-soft').update({
        status: 'deleted',
        version: 2,
        updatedBy: 'ed-uid'
    }));

    const owner = testEnv.authenticatedContext('owner-uid').firestore();
    // Owner hard deletes document, history, and activity
    await assertSucceeds(owner.collection('documents').doc('doc-hard').collection('history').doc('snap-1').delete());
    await assertSucceeds(owner.collection('documents').doc('doc-hard').delete());
    await assertSucceeds(owner.collection('activity').doc('act-1').delete());
});

test('Branch 8 (delete paths): denies editor and viewer from hard deleting documents, history, and activity', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
        await db.collection('documents').doc('doc-1').set({ id: 'doc-1', version: 1, createdBy: 'ed-uid', updatedBy: 'ed-uid' });
        await db.collection('documents').doc('doc-1').collection('history').doc('snap-1').set({ savedBy: 'ed-uid' });
        await db.collection('activity').doc('act-1').set({ actorUid: 'ed-uid' });
    });

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    await assertFails(editor.collection('documents').doc('doc-1').delete());
    await assertFails(editor.collection('documents').doc('doc-1').collection('history').doc('snap-1').delete());
    await assertFails(editor.collection('activity').doc('act-1').delete());

    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    await assertFails(viewer.collection('documents').doc('doc-1').delete());
    await assertFails(viewer.collection('documents').doc('doc-1').collection('history').doc('snap-1').delete());
    await assertFails(viewer.collection('activity').doc('act-1').delete());
});

// ---------------------------------------------------------------------------
// 9. Viewer has no write access anywhere
// ---------------------------------------------------------------------------
test('Branch 9 (viewer write isolation): denies viewer all write operations across collections', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', email: 'vw@example.com', role: 'viewer' });
        await db.collection('documents').doc('doc-1').set({ id: 'doc-1', version: 1, createdBy: 'owner-uid', updatedBy: 'owner-uid' });
        await db.collection('counters').doc('bugs').set({ next: 1 });
        await db.collection('shares').doc('share-1').set({ ciphertext: 'enc' });
        await db.collection('images').doc('img-1').set({ data: 'abc', byteSize: 100, createdBy: 'owner-uid', contentType: 'image/jpeg' });
    });

    const viewer = testEnv.authenticatedContext('vw-uid', { email: 'vw@example.com' }).firestore();

    // Documents
    await assertFails(viewer.collection('documents').doc('doc-new').set({ version: 1, createdBy: 'vw-uid', updatedBy: 'vw-uid' }));
    await assertFails(viewer.collection('documents').doc('doc-1').update({ version: 2, updatedBy: 'vw-uid' }));
    await assertFails(viewer.collection('documents').doc('doc-1').delete());

    // History
    await assertFails(viewer.collection('documents').doc('doc-1').collection('history').doc('snap-new').set({ savedBy: 'vw-uid' }));

    // Activity
    await assertFails(viewer.collection('activity').doc('act-new').set({ actorUid: 'vw-uid' }));

    // Counter
    await assertFails(viewer.collection('counters').doc('bugs').update({ next: 2 }));

    // Shares
    await assertFails(viewer.collection('shares').doc('share-new').set({ ciphertext: 'new' }));
    await assertFails(viewer.collection('shares').doc('share-1').delete());

    // Images
    await assertFails(viewer.collection('images').doc('img-new').set({
        data: 'abc',
        byteSize: 100,
        createdBy: 'vw-uid',
        contentType: 'image/jpeg'
    }));
    await assertFails(viewer.collection('images').doc('img-1').delete());
});

// ---------------------------------------------------------------------------
// 10. shares
// ---------------------------------------------------------------------------
test('Branch 10 (shares): allows anonymous single get by id, member list, and editor writes', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('shares').doc('share-public').set({
            docId: 'doc-1',
            ciphertext: 'cipher-payload',
            createdBy: 'ed-uid',
            createdAt: '2026-10-08T00:00:00Z',
            updatedAt: '2026-10-08T00:00:00Z'
        });
    });

    // Anonymous gets single share by id
    const anon = testEnv.unauthenticatedContext().firestore();
    const docSnap = await assertSucceeds(anon.collection('shares').doc('share-public').get());
    assert.equal(docSnap.data().ciphertext, 'cipher-payload');

    // Member lists shares
    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    await assertSucceeds(editor.collection('shares').get());

    // Editor creates and updates share
    await assertSucceeds(editor.collection('shares').doc('share-2').set({
        docId: 'doc-2',
        ciphertext: 'cipher-2',
        createdBy: 'ed-uid'
    }));
    await assertSucceeds(editor.collection('shares').doc('share-2').update({
        ciphertext: 'cipher-2-updated'
    }));
});

test('Branch 10 (shares): denies anonymous list/write and viewer writes', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
        await db.collection('shares').doc('share-1').set({ ciphertext: 'payload' });
    });

    const anon = testEnv.unauthenticatedContext().firestore();
    // Cannot query or list shares
    await assertFails(anon.collection('shares').get());
    // Cannot write share
    await assertFails(anon.collection('shares').doc('share-anon').set({ ciphertext: 'fake' }));

    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    await assertFails(viewer.collection('shares').doc('share-vw').set({ ciphertext: 'fake' }));
    await assertFails(viewer.collection('shares').doc('share-1').update({ ciphertext: 'changed' }));
});

// ---------------------------------------------------------------------------
// 11. images
// ---------------------------------------------------------------------------
test('Branch 11 (images): allows editor create <=700kB jpeg/png, creator delete, and owner delete', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('images').doc('img-ed').set({
            data: 'base64string',
            byteSize: 300000,
            createdBy: 'ed-uid',
            contentType: 'image/png'
        });
    });

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    // Editor creates valid JPEG <= 700000 bytes with non-negative byteSize
    await assertSucceeds(editor.collection('images').doc('img-new').set({
        data: 'base64jpeg',
        byteSize: 699999,
        createdBy: 'ed-uid',
        contentType: 'image/jpeg'
    }));

    // Creator deletes own image
    await assertSucceeds(editor.collection('images').doc('img-new').delete());

    // Team owner deletes any image
    const owner = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(owner.collection('images').doc('img-ed').delete());
});

test('Branch 11 (images): denies negative byteSize, byteSize > 700kB, unsupported type, updates, and delete by other editor', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-1').set({ uid: 'ed-1', role: 'editor' });
        await db.collection('members').doc('ed-2').set({ uid: 'ed-2', role: 'editor' });
        await db.collection('images').doc('img-1').set({
            data: 'data',
            byteSize: 100,
            createdBy: 'ed-1',
            contentType: 'image/png'
        });
    });

    const editor1 = testEnv.authenticatedContext('ed-1').firestore();
    // Deny negative byteSize: -1
    await assertFails(editor1.collection('images').doc('img-neg').set({
        data: 'neg',
        byteSize: -1,
        createdBy: 'ed-1',
        contentType: 'image/png'
    }));

    // Deny > 700000 bytes
    await assertFails(editor1.collection('images').doc('img-oversize').set({
        data: 'huge',
        byteSize: 700001,
        createdBy: 'ed-1',
        contentType: 'image/png'
    }));

    // Deny unsupported MIME type (e.g. gif)
    await assertFails(editor1.collection('images').doc('img-gif').set({
        data: 'gifdata',
        byteSize: 1000,
        createdBy: 'ed-1',
        contentType: 'image/gif'
    }));

    // Deny update (images are immutable)
    await assertFails(editor1.collection('images').doc('img-1').update({
        byteSize: 200
    }));

    // Other editor cannot delete image created by ed-1
    const editor2 = testEnv.authenticatedContext('ed-2').firestore();
    await assertFails(editor2.collection('images').doc('img-1').delete());
});

// ---------------------------------------------------------------------------
// 12. counters/bugs
// ---------------------------------------------------------------------------
test('Branch 12 (counters/bugs): allows editor create next: 1, owner create next: 100, and editor increment by exactly 1', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
    });

    // Editor creates counters/bugs with next: 1
    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    await assertSucceeds(editor.collection('counters').doc('bugs').set({ next: 1 }));

    // Editor increments next by exactly 1
    await assertSucceeds(editor.collection('counters').doc('bugs').update({
        next: 2
    }));

    // Clean for owner test
    await seed(async (context) => {
        await context.firestore().collection('counters').doc('bugs').delete();
    });

    // Owner can create counters/bugs with next: 100 (for Phase 10 import)
    const owner = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(owner.collection('counters').doc('bugs').set({ next: 100 }));
});

test('Branch 12 (counters/bugs): denies editor create next: 100, editor create other counters, increments not equal to 1, and viewer update', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
    });

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    // Deny editor creating counters/bugs with next: 100
    await assertFails(editor.collection('counters').doc('bugs').set({ next: 100 }));

    // Deny editor creating counter other than counters/bugs
    await assertFails(editor.collection('counters').doc('other').set({ next: 1 }));

    // Seed counters/bugs at next: 100
    await seed(async (context) => {
        await context.firestore().collection('counters').doc('bugs').set({ next: 100 });
    });

    // Cannot jump by 2
    await assertFails(editor.collection('counters').doc('bugs').update({ next: 102 }));
    // Cannot stay same
    await assertFails(editor.collection('counters').doc('bugs').update({ next: 100 }));

    // Viewer cannot update counter
    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    await assertFails(viewer.collection('counters').doc('bugs').update({ next: 101 }));
});

// ---------------------------------------------------------------------------
// 13. workspaces/{id}
// ---------------------------------------------------------------------------
test('Branch 13 (workspaces): allows member read, denies anonymous and stranger read', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
        await db.collection('workspaces').doc('mobile-qa').set({
            name: 'Mobile QA',
            createdAt: '2026-10-10T00:00:00Z',
            createdBy: 'owner-uid'
        });
    });

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection('workspaces').doc('mobile-qa').get());

    const stranger = testEnv.authenticatedContext('stranger-uid').firestore();
    await assertFails(stranger.collection('workspaces').doc('mobile-qa').get());

    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    await assertSucceeds(viewer.collection('workspaces').doc('mobile-qa').get());
    await assertSucceeds(viewer.collection('workspaces').get());
});

test('Branch 13 (workspaces): allows editor and owner to create workspace; denies viewer create', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
    });

    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    // Denies viewer creating workspace
    await assertFails(viewer.collection('workspaces').doc('perf-hub').set({
        name: 'Perf Hub',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'vw-uid'
    }));

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    // Allows editor creating workspace
    await assertSucceeds(editor.collection('workspaces').doc('perf-hub').set({
        name: 'Perf Hub',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'ed-uid'
    }));

    // Denies creating custom workspace with id 'default' via custom schema
    await assertFails(editor.collection('workspaces').doc('default').set({
        name: 'Default',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'ed-uid'
    }));

    // Denies invalid id regex (e.g. uppercase, invalid characters)
    await assertFails(editor.collection('workspaces').doc('Invalid_Id').set({
        name: 'Invalid',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'ed-uid'
    }));

    // Denies mismatched createdBy
    await assertFails(editor.collection('workspaces').doc('another-ws').set({
        name: 'Another',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'spoofed-uid'
    }));
});

test('Branch 13 (workspaces): allows editor and owner rename, allows default rename; denies viewer rename', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
        await db.collection('workspaces').doc('mobile-qa').set({
            name: 'Mobile QA',
            createdAt: '2026-10-10T00:00:00Z',
            createdBy: 'owner-uid'
        });
    });

    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    await assertFails(viewer.collection('workspaces').doc('mobile-qa').update({ name: 'Renamed by Viewer' }));

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    await assertSucceeds(editor.collection('workspaces').doc('mobile-qa').update({ name: 'Mobile QA Renamed' }));

    // Allows default rename by setting/updating workspaces/default
    await assertSucceeds(editor.collection('workspaces').doc('default').set({ name: 'Custom Default Name' }));
});

test('Branch 13 (workspaces): denies delete of default workspace, denies delete by editor/viewer, denies owner delete when workspace contains documents, and allows owner delete when empty', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
        await db.collection('workspaces').doc('default').set({ name: 'Personal' });
        await db.collection('workspaces').doc('ws-with-docs').set({
            name: 'WS With Docs',
            createdAt: '2026-10-10T00:00:00Z',
            createdBy: 'owner-uid',
            docCount: 1
        });
        await db.collection('workspaces').doc('empty-ws').set({
            name: 'Empty WS',
            createdAt: '2026-10-10T00:00:00Z',
            createdBy: 'owner-uid',
            docCount: 0
        });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Doc in WS',
            workspaceId: 'ws-with-docs',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
    });

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    const owner = testEnv.authenticatedContext('owner-uid').firestore();

    // Editor and viewer cannot delete any workspace
    await assertFails(editor.collection('workspaces').doc('empty-ws').delete());
    await assertFails(viewer.collection('workspaces').doc('empty-ws').delete());

    // Owner cannot delete default workspace
    await assertFails(owner.collection('workspaces').doc('default').delete());

    // Owner cannot delete workspace that still contains documents
    await assertFails(owner.collection('workspaces').doc('ws-with-docs').delete());

    // Owner can delete empty workspace
    await assertSucceeds(owner.collection('workspaces').doc('empty-ws').delete());
});

