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
    // Cannot create doc with malformed or illegal characters in document path ID
    await assertFails(editor.collection('documents').doc("doc'xss").set({
        id: "doc'xss",
        title: 'XSS Doc',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid'
    }));
    await assertFails(editor.collection('documents').doc('doc.with.dot').set({
        id: 'doc.with.dot',
        title: 'Dot Doc',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid'
    }));
    // Cannot create doc with ID length > 64 chars
    const longId = 'doc_' + 'a'.repeat(65);
    await assertFails(editor.collection('documents').doc(longId).set({
        id: longId,
        title: 'Long ID Doc',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid'
    }));
    // Cannot create doc where body id does not match path id or is malformed
    await assertFails(editor.collection('documents').doc('doc-valid-id').set({
        id: "doc'injection",
        title: 'Mismatched ID',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid'
    }));
    // Valid ID with hyphens, underscores and alphanumeric succeeds
    await assertSucceeds(editor.collection('documents').doc('doc_valid-123_ABC').set({
        id: 'doc_valid-123_ABC',
        title: 'Valid ID Doc',
        version: 1,
        createdBy: 'ed-uid',
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
    // Cannot update with malformed id
    await assertFails(editor.collection('documents').doc('doc-1').update({
        version: 2,
        id: "doc'xss",
        updatedBy: 'ed-uid'
    }));
    // Seed a doc without a body id field to exercise the update restriction on unmatching/malformed id
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('documents').doc('doc-no-body-id').set({
            title: 'Doc without body id',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid',
            createdAt: '2026-10-08T00:00:00Z',
            updatedAt: '2026-10-08T00:00:00Z'
        });
    });
    await assertFails(editor.collection('documents').doc('doc-no-body-id').update({
        version: 2,
        id: "doc'xss",
        updatedBy: 'ed-uid'
    }));
    await assertFails(editor.collection('documents').doc('doc-no-body-id').update({
        version: 2,
        id: 'mismatched-id',
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

    // Owner can update counters/bugs by jumping forward (for Phase 10 import)
    await assertSucceeds(owner.collection('counters').doc('bugs').update({ next: 200 }));
    // Owner cannot decrease counter backwards
    await assertFails(owner.collection('counters').doc('bugs').update({ next: 50 }));
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

test('Branch 13 (workspaces): denies delete of default, denies delete by editor/viewer, denies owner delete when workspace contains documents, requires atomic docCount updates, and allows owner delete when empty', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('ed-uid').set({ uid: 'ed-uid', role: 'editor' });
        await db.collection('members').doc('vw-uid').set({ uid: 'vw-uid', role: 'viewer' });
        await db.collection('workspaces').doc('default').set({ name: 'Personal' });
    });

    const editor = testEnv.authenticatedContext('ed-uid').firestore();
    const viewer = testEnv.authenticatedContext('vw-uid').firestore();
    const owner = testEnv.authenticatedContext('owner-uid').firestore();

    // 1. Workspace created with exact payload of createWorkspace() without docCount/hasDocs/hasDocuments
    const wsPayload = {
        name: 'Mobile QA',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'ed-uid'
    };
    await assertSucceeds(editor.collection('workspaces').doc('mobile-qa').set(wsPayload));

    // Absent counter is NOT treated as 0: owner deleting workspace created without docCount is denied
    await assertFails(owner.collection('workspaces').doc('mobile-qa').delete());

    // 2. Rules reject creating doc with workspaceId without accompanying docCount increment
    await assertFails(editor.collection('documents').doc('doc-isolated').set({
        id: 'doc-isolated',
        title: 'Doc without counter',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid',
        workspaceId: 'mobile-qa'
    }));

    // 3. Rules reject modifying docCount without doc create/delete in same commit
    await assertFails(editor.collection('workspaces').doc('mobile-qa').update({ docCount: 1 }));
    await assertFails(editor.collection('workspaces').doc('mobile-qa').update({ docCount: 0 }));

    // 4. Create document with different ID and matching workspaceId with atomic batch counter increment (+1)
    const createBatch = editor.batch();
    createBatch.set(editor.collection('documents').doc('doc-xyz-99'), {
        id: 'doc-xyz-99',
        title: 'Real Doc In Workspace',
        version: 1,
        createdBy: 'ed-uid',
        updatedBy: 'ed-uid',
        workspaceId: 'mobile-qa'
    });
    createBatch.update(editor.collection('workspaces').doc('mobile-qa'), {
        docCount: 1,
        lastDocId: 'doc-xyz-99'
    });
    await assertSucceeds(createBatch.commit());

    // 5. Deleting workspace while document exists is rejected
    await assertFails(editor.collection('workspaces').doc('mobile-qa').delete());
    await assertFails(viewer.collection('workspaces').doc('mobile-qa').delete());
    await assertFails(owner.collection('workspaces').doc('mobile-qa').delete());

    // 6. Rules reject deleting document without accompanying docCount decrement
    await assertFails(owner.collection('documents').doc('doc-xyz-99').delete());

    // 7. Delete document with atomic batch counter decrement (-1)
    const deleteBatch = owner.batch();
    deleteBatch.delete(owner.collection('documents').doc('doc-xyz-99'));
    deleteBatch.update(owner.collection('workspaces').doc('mobile-qa'), {
        docCount: 0,
        lastDeletedDocId: 'doc-xyz-99'
    });
    await assertSucceeds(deleteBatch.commit());

    // 8. Now that docCount is 0 (no documents remain), owner deleting this workspace succeeds
    await assertSucceeds(owner.collection('workspaces').doc('mobile-qa').delete());

    // 9. Another workspace of same kind created with docCount: 0 and no documents can be deleted by owner
    await assertSucceeds(editor.collection('workspaces').doc('empty-ws').set({
        name: 'Empty Workspace',
        createdAt: '2026-10-10T00:00:00Z',
        createdBy: 'ed-uid',
        docCount: 0
    }));
    await assertFails(editor.collection('workspaces').doc('empty-ws').delete());
    await assertFails(viewer.collection('workspaces').doc('empty-ws').delete());
    await assertSucceeds(owner.collection('workspaces').doc('empty-ws').delete());

    // 10. Default workspace cannot be deleted
    await assertFails(owner.collection('workspaces').doc('default').delete());
});

// ---------------------------------------------------------------------------
// 14. notifications/{notifId}
// ---------------------------------------------------------------------------
test('Branch 14 (notifications): allows recipient member read/list, denies list without recipient filter and stranger read', async () => {
    // Seed members and a notification
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('recipient-uid').set({ uid: 'recipient-uid', role: 'viewer', email: 'recip@example.com' });
        await db.collection('members').doc('other-uid').set({ uid: 'other-uid', role: 'editor', email: 'other@example.com' });
        await db.collection('notifications').doc('notif-1').set({
            recipientUid: 'recipient-uid',
            actorUid: 'owner-uid',
            actorName: 'Team Owner',
            actorEmail: 'owner@example.com',
            docId: 'doc-1',
            docTitle: 'Bug title',
            kind: 'bug',
            signalKey: '',
            createdAt: 1000,
            readAt: null
        });
    });

    const recipient = testEnv.authenticatedContext('recipient-uid', { email: 'recip@example.com' }).firestore();
    const other = testEnv.authenticatedContext('other-uid', { email: 'other@example.com' }).firestore();
    const stranger = testEnv.authenticatedContext('stranger-uid', { email: 'stranger@example.com' }).firestore();
    const unauthed = testEnv.unauthenticatedContext().firestore();

    // 1. Recipient can get their notification
    const snap = await assertSucceeds(recipient.collection('notifications').doc('notif-1').get());
    assert.equal(snap.exists, true);

    // 2. Recipient can query their notifications with where recipientUid == auth.uid
    const listSnap = await assertSucceeds(recipient.collection('notifications').where('recipientUid', '==', 'recipient-uid').get());
    assert.equal(listSnap.docs.length, 1);

    // 3. Querying without filtering recipientUid is DENIED
    await assertFails(recipient.collection('notifications').get());

    // 4. Other member cannot read recipient's notification
    await assertFails(other.collection('notifications').doc('notif-1').get());
    await assertFails(other.collection('notifications').where('recipientUid', '==', 'recipient-uid').get());

    // 5. Stranger and unauthed cannot read
    await assertFails(stranger.collection('notifications').doc('notif-1').get());
    await assertFails(stranger.collection('notifications').where('recipientUid', '==', 'recipient-uid').get());
    await assertFails(unauthed.collection('notifications').doc('notif-1').get());
});

test('Branch 14 (notifications): allows editor/owner create matching saved doc, denies self-assignment, viewer create, and doc mismatch', async () => {
    // Seed members and documents
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('editor-uid').set({ uid: 'editor-uid', role: 'editor', email: 'ed@example.com' });
        await db.collection('members').doc('viewer-uid').set({ uid: 'viewer-uid', role: 'viewer', email: 'vw@example.com' });
        await db.collection('documents').doc('bug-doc').set({
            id: 'bug-doc',
            title: 'Bug Document',
            category: 'bug',
            bugData: { assignee: 'Viewer (vw@example.com)', assigneeUid: 'viewer-uid' }
        });
        await db.collection('documents').doc('focus-doc').set({
            id: 'focus-doc',
            title: 'Focus Document',
            category: 'task',
            focusWorkflow: {
                critical: { owner: 'Viewer (vw@example.com)', ownerUid: 'viewer-uid' }
            }
        });
        await db.collection('documents').doc('task-doc').set({
            id: 'task-doc',
            title: 'Task Document',
            category: 'task',
            assignee: 'Viewer (vw@example.com)',
            assigneeUid: 'viewer-uid'
        });
    });

    const editor = testEnv.authenticatedContext('editor-uid', { email: 'ed@example.com' }).firestore();
    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();
    const viewer = testEnv.authenticatedContext('viewer-uid', { email: 'vw@example.com' }).firestore();

    // 1. Editor creates valid bug notification for viewer
    await assertSucceeds(editor.collection('notifications').doc('notif-bug-1').set({
        recipientUid: 'viewer-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'bug',
        signalKey: '',
        createdAt: 2000,
        readAt: null
    }));

    // 2. Owner creates valid focus notification for viewer
    await assertSucceeds(owner.collection('notifications').doc('notif-focus-1').set({
        recipientUid: 'viewer-uid',
        actorUid: 'owner-uid',
        actorName: 'Team Owner',
        actorEmail: 'owner@example.com',
        docId: 'focus-doc',
        docTitle: 'Focus Document',
        kind: 'focus',
        signalKey: 'critical',
        createdAt: 2001,
        readAt: null
    }));

    // 2b. Editor creates valid task notification for viewer
    await assertSucceeds(editor.collection('notifications').doc('notif-task-1').set({
        recipientUid: 'viewer-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'task-doc',
        docTitle: 'Task Document',
        kind: 'task',
        signalKey: '',
        createdAt: 2001,
        readAt: null
    }));

    // 2c. Task notification with mismatched recipientUid is DENIED
    await assertFails(editor.collection('notifications').doc('notif-task-mismatch').set({
        recipientUid: 'owner-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'task-doc',
        docTitle: 'Task Document',
        kind: 'task',
        signalKey: '',
        createdAt: 2001,
        readAt: null
    }));

    // 2d. Task notification for non-task doc is DENIED
    await assertFails(editor.collection('notifications').doc('notif-task-wrongcat').set({
        recipientUid: 'viewer-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'task',
        signalKey: '',
        createdAt: 2001,
        readAt: null
    }));

    // 2e. Task notification with non-empty signalKey is DENIED
    await assertFails(editor.collection('notifications').doc('notif-task-signal').set({
        recipientUid: 'viewer-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'task-doc',
        docTitle: 'Task Document',
        kind: 'task',
        signalKey: 'critical',
        createdAt: 2001,
        readAt: null
    }));

    // 3. Self-assignment (recipientUid == actorUid) is DENIED
    await assertFails(editor.collection('notifications').doc('notif-self').set({
        recipientUid: 'editor-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'bug',
        signalKey: '',
        createdAt: 2002,
        readAt: null
    }));

    // 4. Viewer cannot create notifications
    await assertFails(viewer.collection('notifications').doc('notif-vw').set({
        recipientUid: 'editor-uid',
        actorUid: 'viewer-uid',
        actorName: 'Viewer',
        actorEmail: 'vw@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'bug',
        signalKey: '',
        createdAt: 2003,
        readAt: null
    }));

    // 5. Recipient who is NOT a member in members collection is DENIED
    await assertFails(editor.collection('notifications').doc('notif-nonmember').set({
        recipientUid: 'ghost-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'bug',
        signalKey: '',
        createdAt: 2004,
        readAt: null
    }));

    // 6. Bug notification with recipient that does not match saved doc assigneeUid is DENIED
    await assertFails(editor.collection('notifications').doc('notif-mismatch').set({
        recipientUid: 'owner-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'bug',
        signalKey: '',
        createdAt: 2005,
        readAt: null
    }));

    // 7. readAt must be null on creation
    await assertFails(editor.collection('notifications').doc('notif-read-initial').set({
        recipientUid: 'viewer-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor',
        actorEmail: 'ed@example.com',
        docId: 'bug-doc',
        docTitle: 'Bug Document',
        kind: 'bug',
        signalKey: '',
        createdAt: 2006,
        readAt: 2006
    }));
});

test('Branch 14 (notifications): allows recipient to transition readAt null to int, denies repeated update, field tampering, and delete', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('recipient-uid').set({ uid: 'recipient-uid', role: 'viewer', email: 'recip@example.com' });
        await db.collection('members').doc('other-uid').set({ uid: 'other-uid', role: 'editor', email: 'other@example.com' });
        await db.collection('notifications').doc('notif-unread').set({
            recipientUid: 'recipient-uid',
            actorUid: 'owner-uid',
            actorName: 'Team Owner',
            actorEmail: 'owner@example.com',
            docId: 'doc-1',
            docTitle: 'Title',
            kind: 'bug',
            signalKey: '',
            createdAt: 1000,
            readAt: null
        });
        await db.collection('notifications').doc('notif-already-read').set({
            recipientUid: 'recipient-uid',
            actorUid: 'owner-uid',
            actorName: 'Team Owner',
            actorEmail: 'owner@example.com',
            docId: 'doc-2',
            docTitle: 'Title 2',
            kind: 'bug',
            signalKey: '',
            createdAt: 1000,
            readAt: 1500
        });
    });

    const recipient = testEnv.authenticatedContext('recipient-uid', { email: 'recip@example.com' }).firestore();
    const other = testEnv.authenticatedContext('other-uid', { email: 'other@example.com' }).firestore();
    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();

    // 1. Recipient updates readAt from null to int: SUCCEEDS
    await assertSucceeds(recipient.collection('notifications').doc('notif-unread').update({
        readAt: 2500
    }));

    // 2. Recipient updating readAt when it is already set is DENIED
    await assertFails(recipient.collection('notifications').doc('notif-already-read').update({
        readAt: 3000
    }));

    // 3. Recipient modifying other fields (e.g. docTitle) is DENIED
    await assertFails(recipient.collection('notifications').doc('notif-unread').update({
        docTitle: 'Hacked title'
    }));

    // 4. Other member cannot update recipient's notification
    await assertFails(other.collection('notifications').doc('notif-already-read').update({
        readAt: 4000
    }));

    // 5. Delete is allowed for recipient, DENIED for other member and owner on live doc
    await assertSucceeds(recipient.collection('notifications').doc('notif-unread').delete());
    await assertFails(other.collection('notifications').doc('notif-already-read').delete());
    await assertFails(owner.collection('notifications').doc('notif-already-read').delete());
});

// ---------------------------------------------------------------------------
// 15. comments subcollection & comment_mention notifications
// ---------------------------------------------------------------------------
test('Branch 15 (comments): allows all member roles (viewer, editor, owner) to read and create comments with valid schema', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner', email: 'owner@example.com' });
        await db.collection('members').doc('editor-uid').set({ uid: 'editor-uid', role: 'editor', email: 'editor@example.com' });
        await db.collection('members').doc('viewer-uid').set({ uid: 'viewer-uid', role: 'viewer', email: 'viewer@example.com' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Bug Report 1',
            category: 'bug',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
        await db.collection('documents').doc('doc-1').collection('comments').doc('cmt-seeded').set({
            id: 'cmt-seeded',
            docId: 'doc-1',
            authorUid: 'owner-uid',
            authorName: 'Owner',
            content: 'Seeded comment',
            createdAt: 1000
        });
    });

    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();
    const editor = testEnv.authenticatedContext('editor-uid', { email: 'editor@example.com' }).firestore();
    const viewer = testEnv.authenticatedContext('viewer-uid', { email: 'viewer@example.com' }).firestore();

    // 1. All roles can read existing comments
    await assertSucceeds(owner.collection('documents').doc('doc-1').collection('comments').doc('cmt-seeded').get());
    await assertSucceeds(editor.collection('documents').doc('doc-1').collection('comments').doc('cmt-seeded').get());
    await assertSucceeds(viewer.collection('documents').doc('doc-1').collection('comments').doc('cmt-seeded').get());

    // 2. Viewer can create top-level comment
    await assertSucceeds(viewer.collection('documents').doc('doc-1').collection('comments').doc('cmt-viewer').set({
        id: 'cmt-viewer',
        docId: 'doc-1',
        authorUid: 'viewer-uid',
        authorName: 'Viewer User',
        authorEmail: 'viewer@example.com',
        content: 'I observed this bug as well.',
        createdAt: 2000
    }));

    // 3. Editor can create reply comment with parentId
    await assertSucceeds(editor.collection('documents').doc('doc-1').collection('comments').doc('cmt-editor').set({
        id: 'cmt-editor',
        docId: 'doc-1',
        parentId: 'cmt-viewer',
        authorUid: 'editor-uid',
        authorName: 'Editor User',
        authorEmail: 'editor@example.com',
        content: 'Fixing this in next release.',
        createdAt: 2001
    }));

    // 4. Owner can create comment
    await assertSucceeds(owner.collection('documents').doc('doc-1').collection('comments').doc('cmt-owner').set({
        id: 'cmt-owner',
        docId: 'doc-1',
        authorUid: 'owner-uid',
        content: 'Approved.',
        createdAt: 2002
    }));
});

test('Branch 15 (comments): denies stranger and unauthenticated read and create', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Doc 1',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
        await db.collection('documents').doc('doc-1').collection('comments').doc('cmt-1').set({
            docId: 'doc-1',
            authorUid: 'owner-uid',
            content: 'Hello',
            createdAt: 1000
        });
    });

    const stranger = testEnv.authenticatedContext('stranger-uid', { email: 'stranger@example.com' }).firestore();
    const unauthed = testEnv.unauthenticatedContext().firestore();

    // Stranger cannot read or create
    await assertFails(stranger.collection('documents').doc('doc-1').collection('comments').doc('cmt-1').get());
    await assertFails(stranger.collection('documents').doc('doc-1').collection('comments').doc('cmt-stranger').set({
        docId: 'doc-1',
        authorUid: 'stranger-uid',
        content: 'Intruder comment',
        createdAt: 1005
    }));

    // Unauthenticated cannot read or create
    await assertFails(unauthed.collection('documents').doc('doc-1').collection('comments').doc('cmt-1').get());
    await assertFails(unauthed.collection('documents').doc('doc-1').collection('comments').doc('cmt-anon').set({
        docId: 'doc-1',
        authorUid: 'anon',
        content: 'Anon comment',
        createdAt: 1005
    }));
});

test('Branch 15 (comments): validates schema on create (docId match, authorUid, createdAt int, non-empty and max 4000 char content)', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('member-uid').set({ uid: 'member-uid', role: 'editor', email: 'mem@example.com' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Doc 1',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
    });

    const member = testEnv.authenticatedContext('member-uid', { email: 'mem@example.com' }).firestore();

    // 1. authorUid != auth.uid is DENIED
    await assertFails(member.collection('documents').doc('doc-1').collection('comments').doc('cmt-spoof').set({
        docId: 'doc-1',
        authorUid: 'other-uid',
        content: 'Impersonation attempt',
        createdAt: 1000
    }));

    // 2. docId != path id is DENIED
    await assertFails(member.collection('documents').doc('doc-1').collection('comments').doc('cmt-mismatch-doc').set({
        docId: 'doc-other',
        authorUid: 'member-uid',
        content: 'Wrong docId',
        createdAt: 1000
    }));

    // 3. createdAt not an int is DENIED
    await assertFails(member.collection('documents').doc('doc-1').collection('comments').doc('cmt-bad-time').set({
        docId: 'doc-1',
        authorUid: 'member-uid',
        content: 'String date',
        createdAt: '2026-11-15T00:00:00Z'
    }));

    // 4. content empty string is DENIED
    await assertFails(member.collection('documents').doc('doc-1').collection('comments').doc('cmt-empty').set({
        docId: 'doc-1',
        authorUid: 'member-uid',
        content: '',
        createdAt: 1000
    }));

    // 5. content exceeding 4000 chars is DENIED
    const oversizedContent = 'a'.repeat(4001);
    await assertFails(member.collection('documents').doc('doc-1').collection('comments').doc('cmt-oversized').set({
        docId: 'doc-1',
        authorUid: 'member-uid',
        content: oversizedContent,
        createdAt: 1000
    }));

    // 6. content exactly 4000 chars SUCCEEDS
    const maxContent = 'a'.repeat(4000);
    await assertSucceeds(member.collection('documents').doc('doc-1').collection('comments').doc('cmt-max').set({
        docId: 'doc-1',
        authorUid: 'member-uid',
        content: maxContent,
        createdAt: 1000
    }));
});

test('Branch 15 (comments): allows author update content and updatedAt; denies changing authorUid, docId, createdAt, parentId, and non-author updates', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('author-uid').set({ uid: 'author-uid', role: 'viewer', email: 'author@example.com' });
        await db.collection('members').doc('other-uid').set({ uid: 'other-uid', role: 'editor', email: 'other@example.com' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Doc 1',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
        await db.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').set({
            docId: 'doc-1',
            parentId: 'root-cmt',
            authorUid: 'author-uid',
            content: 'Original comment text',
            createdAt: 1000
        });
    });

    const author = testEnv.authenticatedContext('author-uid', { email: 'author@example.com' }).firestore();
    const other = testEnv.authenticatedContext('other-uid', { email: 'other@example.com' }).firestore();
    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();

    // 1. Author updates content and updatedAt: SUCCEEDS
    await assertSucceeds(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        content: 'Updated comment text',
        updatedAt: 1050
    }));

    // 2. Author trying to update without updatedAt int: DENIED
    await assertFails(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        content: 'Another update without int updatedAt'
    }));

    // 3. Author tampering with authorUid: DENIED
    await assertFails(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        authorUid: 'other-uid',
        content: 'Tampered author',
        updatedAt: 1060
    }));

    // 4. Author tampering with docId: DENIED
    await assertFails(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        docId: 'doc-2',
        content: 'Tampered docId',
        updatedAt: 1060
    }));

    // 5. Author tampering with createdAt: DENIED
    await assertFails(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        createdAt: 9999,
        content: 'Tampered createdAt',
        updatedAt: 1060
    }));

    // 6. Author tampering with parentId: DENIED
    await assertFails(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        parentId: 'different-parent',
        content: 'Tampered parentId',
        updatedAt: 1060
    }));

    // 7. Non-author editor attempting update: DENIED
    await assertFails(other.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        content: 'Hijacked by editor',
        updatedAt: 1070
    }));

    // 8. Non-author owner attempting update: DENIED (updates are author-only)
    await assertFails(owner.collection('documents').doc('doc-1').collection('comments').doc('cmt-orig').update({
        content: 'Hijacked by owner',
        updatedAt: 1070
    }));
});

test('Branch 15 (comments): allows author and Team Owner to delete; denies non-author editor/viewer deletion', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('author-uid').set({ uid: 'author-uid', role: 'viewer', email: 'author@example.com' });
        await db.collection('members').doc('editor-uid').set({ uid: 'editor-uid', role: 'editor', email: 'editor@example.com' });
        await db.collection('members').doc('viewer-uid').set({ uid: 'viewer-uid', role: 'viewer', email: 'viewer@example.com' });
        await db.collection('documents').doc('doc-1').set({
            id: 'doc-1',
            title: 'Doc 1',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
        await db.collection('documents').doc('doc-1').collection('comments').doc('cmt-author-del').set({
            docId: 'doc-1',
            authorUid: 'author-uid',
            content: 'Comment to be deleted by author',
            createdAt: 1000
        });
        await db.collection('documents').doc('doc-1').collection('comments').doc('cmt-owner-del').set({
            docId: 'doc-1',
            authorUid: 'author-uid',
            content: 'Comment to be deleted by owner',
            createdAt: 1001
        });
    });

    const author = testEnv.authenticatedContext('author-uid', { email: 'author@example.com' }).firestore();
    const editor = testEnv.authenticatedContext('editor-uid', { email: 'editor@example.com' }).firestore();
    const viewer = testEnv.authenticatedContext('viewer-uid', { email: 'viewer@example.com' }).firestore();
    const owner = testEnv.authenticatedContext('owner-uid', { email: 'owner@example.com' }).firestore();

    // 1. Non-author editor cannot delete: DENIED
    await assertFails(editor.collection('documents').doc('doc-1').collection('comments').doc('cmt-author-del').delete());

    // 2. Non-author viewer cannot delete: DENIED
    await assertFails(viewer.collection('documents').doc('doc-1').collection('comments').doc('cmt-author-del').delete());

    // 3. Author deletes own comment: SUCCEEDS
    await assertSucceeds(author.collection('documents').doc('doc-1').collection('comments').doc('cmt-author-del').delete());

    // 4. Team Owner deletes another member's comment: SUCCEEDS
    await assertSucceeds(owner.collection('documents').doc('doc-1').collection('comments').doc('cmt-owner-del').delete());
});

test('Branch 15 (notifications): allows any member (including viewer) to create comment_mention notification for another member on existing document', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', name: 'Team', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('editor-uid').set({ uid: 'editor-uid', role: 'editor', email: 'editor@example.com' });
        await db.collection('members').doc('viewer-uid').set({ uid: 'viewer-uid', role: 'viewer', email: 'viewer@example.com' });
        await db.collection('documents').doc('doc-bug').set({
            id: 'doc-bug',
            title: 'Bug Document',
            category: 'bug',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
    });

    const viewer = testEnv.authenticatedContext('viewer-uid', { email: 'viewer@example.com' }).firestore();
    const editor = testEnv.authenticatedContext('editor-uid', { email: 'editor@example.com' }).firestore();
    const stranger = testEnv.authenticatedContext('stranger-uid', { email: 'stranger@example.com' }).firestore();

    // 1. Viewer creates comment_mention notification for editor on existing document: SUCCEEDS
    await assertSucceeds(viewer.collection('notifications').doc('notif-mention-1').set({
        recipientUid: 'editor-uid',
        actorUid: 'viewer-uid',
        actorName: 'Viewer User',
        actorEmail: 'viewer@example.com',
        docId: 'doc-bug',
        docTitle: 'Bug Document',
        kind: 'comment_mention',
        signalKey: '',
        createdAt: 2000,
        readAt: null
    }));

    // 2. Editor creates comment_mention notification for owner on existing document: SUCCEEDS
    await assertSucceeds(editor.collection('notifications').doc('notif-mention-2').set({
        recipientUid: 'owner-uid',
        actorUid: 'editor-uid',
        actorName: 'Editor User',
        actorEmail: 'editor@example.com',
        docId: 'doc-bug',
        docTitle: 'Bug Document',
        kind: 'comment_mention',
        signalKey: '',
        createdAt: 2001,
        readAt: null
    }));

    // 3. Self-mention (recipientUid == actorUid) is DENIED
    await assertFails(viewer.collection('notifications').doc('notif-mention-self').set({
        recipientUid: 'viewer-uid',
        actorUid: 'viewer-uid',
        actorName: 'Viewer User',
        actorEmail: 'viewer@example.com',
        docId: 'doc-bug',
        docTitle: 'Bug Document',
        kind: 'comment_mention',
        signalKey: '',
        createdAt: 2002,
        readAt: null
    }));

    // 4. Mention on non-existent document is DENIED
    await assertFails(viewer.collection('notifications').doc('notif-mention-bad-doc').set({
        recipientUid: 'editor-uid',
        actorUid: 'viewer-uid',
        actorName: 'Viewer User',
        actorEmail: 'viewer@example.com',
        docId: 'doc-does-not-exist',
        docTitle: 'Ghost Doc',
        kind: 'comment_mention',
        signalKey: '',
        createdAt: 2003,
        readAt: null
    }));

    // 5. Mention with non-member recipient is DENIED
    await assertFails(viewer.collection('notifications').doc('notif-mention-bad-recip').set({
        recipientUid: 'ghost-recipient',
        actorUid: 'viewer-uid',
        actorName: 'Viewer User',
        actorEmail: 'viewer@example.com',
        docId: 'doc-bug',
        docTitle: 'Bug Document',
        kind: 'comment_mention',
        signalKey: '',
        createdAt: 2004,
        readAt: null
    }));

    // 6. Mention with signalKey != '' is DENIED
    await assertFails(viewer.collection('notifications').doc('notif-mention-bad-signal').set({
        recipientUid: 'editor-uid',
        actorUid: 'viewer-uid',
        actorName: 'Viewer User',
        actorEmail: 'viewer@example.com',
        docId: 'doc-bug',
        docTitle: 'Bug Document',
        kind: 'comment_mention',
        signalKey: 'critical',
        createdAt: 2005,
        readAt: null
    }));

    // 7. Stranger cannot create comment_mention notification: DENIED
    await assertFails(stranger.collection('notifications').doc('notif-mention-stranger').set({
        recipientUid: 'editor-uid',
        actorUid: 'stranger-uid',
        actorName: 'Stranger',
        actorEmail: 'stranger@example.com',
        docId: 'doc-bug',
        docTitle: 'Bug Document',
        kind: 'comment_mention',
        signalKey: '',
        createdAt: 2006,
        readAt: null
    }));
});

// ---------------------------------------------------------------------------
// 15. Stage 1 Hotfixes: secrets subcollection & tightened shares
// ---------------------------------------------------------------------------
test('Branch 15 (secrets subcollection): allows editor/owner read/write, owner delete, denies viewer and stranger', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('owner-uid').set({ uid: 'owner-uid', role: 'owner' });
        await db.collection('members').doc('editor-uid').set({ uid: 'editor-uid', role: 'editor' });
        await db.collection('members').doc('viewer-uid').set({ uid: 'viewer-uid', role: 'viewer' });
        await db.collection('documents').doc('doc-cred').set({
            id: 'doc-cred',
            title: 'DB Credential',
            category: 'credential',
            version: 1,
            createdBy: 'owner-uid',
            updatedBy: 'owner-uid'
        });
        await db.collection('documents').doc('doc-cred').collection('secrets').doc('credential').set({
            password: 'secret-password-123',
            updatedAt: 1000
        });
    });

    const owner = testEnv.authenticatedContext('owner-uid').firestore();
    const editor = testEnv.authenticatedContext('editor-uid').firestore();
    const viewer = testEnv.authenticatedContext('viewer-uid').firestore();
    const stranger = testEnv.authenticatedContext('stranger-uid').firestore();

    // Editor & owner CAN read secrets
    const edSnap = await assertSucceeds(editor.collection('documents').doc('doc-cred').collection('secrets').doc('credential').get());
    assert.equal(edSnap.data().password, 'secret-password-123');
    await assertSucceeds(owner.collection('documents').doc('doc-cred').collection('secrets').doc('credential').get());

    // Editor & owner CAN write secrets
    await assertSucceeds(editor.collection('documents').doc('doc-cred').collection('secrets').doc('credential').set({
        password: 'updated-secret-by-editor',
        updatedAt: 2000
    }));

    // Viewer CANNOT read or write secrets
    await assertFails(viewer.collection('documents').doc('doc-cred').collection('secrets').doc('credential').get());
    await assertFails(viewer.collection('documents').doc('doc-cred').collection('secrets').doc('credential').set({
        password: 'hacked',
        updatedAt: 3000
    }));

    // Stranger CANNOT read or write secrets
    await assertFails(stranger.collection('documents').doc('doc-cred').collection('secrets').doc('credential').get());
    await assertFails(stranger.collection('documents').doc('doc-cred').collection('secrets').doc('credential').set({
        password: 'hacked',
        updatedAt: 4000
    }));

    // Editor CANNOT delete secrets (only team owner can delete)
    await assertFails(editor.collection('documents').doc('doc-cred').collection('secrets').doc('credential').delete());

    // Owner CAN delete secrets
    await assertSucceeds(owner.collection('documents').doc('doc-cred').collection('secrets').doc('credential').delete());

    // Root document DENIES credential creation with non-empty password
    await assertFails(editor.collection('documents').doc('doc-cred-leaked').set({
        id: 'doc-cred-leaked',
        title: 'Leaked Cred',
        category: 'credential',
        password: 'plaintext-should-be-denied',
        version: 1,
        createdBy: 'editor-uid',
        updatedBy: 'editor-uid'
    }));

    // Root document ALLOWS credential creation when password is empty or absent
    await assertSucceeds(editor.collection('documents').doc('doc-cred-safe').set({
        id: 'doc-cred-safe',
        title: 'Safe Cred',
        category: 'credential',
        password: '',
        version: 1,
        createdBy: 'editor-uid',
        updatedBy: 'editor-uid'
    }));
});

test('Branch 15 (owner lockout recovery & batch rules): owner without member doc can read meta/team', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'locked-out-owner-uid', initialized: true });
        // NOTE: members/locked-out-owner-uid is deliberately NOT created to simulate lost member doc
    });

    const lockedOwner = testEnv.authenticatedContext('locked-out-owner-uid').firestore();
    const stranger = testEnv.authenticatedContext('random-stranger-uid').firestore();

    // Owner without member doc CAN read meta/team
    const teamSnap = await assertSucceeds(lockedOwner.collection('meta').doc('team').get());
    assert.equal(teamSnap.data().ownerUid, 'locked-out-owner-uid');

    // Stranger CANNOT read meta/team
    await assertFails(stranger.collection('meta').doc('team').get());
});

test('Branch 15 (tightened shares rules): validates keys, docId size and ciphertext size', async () => {
    await seed(async (context) => {
        const db = context.firestore();
        await db.collection('meta').doc('team').set({ ownerUid: 'owner-uid', initialized: true });
        await db.collection('members').doc('editor-uid').set({ uid: 'editor-uid', role: 'editor' });
    });

    const editor = testEnv.authenticatedContext('editor-uid').firestore();

    // 1. Valid share creation succeeds
    await assertSucceeds(editor.collection('shares').doc('share-tight-1').set({
        docId: 'doc-123',
        title: 'Share Spec',
        ciphertext: 'valid-encrypted-ciphertext',
        createdBy: 'editor-uid',
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: 'default',
        expiresAt: 2000
    }));

    // 2. Extra unapproved key fails (e.g. key, password, pat)
    await assertFails(editor.collection('shares').doc('share-tight-badkey').set({
        docId: 'doc-123',
        ciphertext: 'cipher',
        unapprovedKey: 'malicious-data'
    }));
    await assertFails(editor.collection('shares').doc('share-tight-badpwd').set({
        docId: 'doc-123',
        ciphertext: 'cipher',
        password: 'leaked-password'
    }));

    // 3. Oversized ciphertext (> 600,000 chars) fails
    const hugeCiphertext = 'a'.repeat(600001);
    await assertFails(editor.collection('shares').doc('share-tight-huge').set({
        docId: 'doc-123',
        ciphertext: hugeCiphertext
    }));

    // 4. Oversized docId (> 64 chars) or non-string docId fails
    const hugeDocId = 'd'.repeat(65);
    await assertFails(editor.collection('shares').doc('share-tight-longdoc').set({
        docId: hugeDocId,
        ciphertext: 'cipher'
    }));
    await assertFails(editor.collection('shares').doc('share-tight-nonstrdoc').set({
        docId: 12345,
        ciphertext: 'cipher'
    }));

    // 5. Updating with allowed keys and sizes succeeds
    await assertSucceeds(editor.collection('shares').doc('share-tight-1').update({
        ciphertext: 'updated-valid-cipher',
        updatedAt: 1500
    }));

    // 6. Updating with illegal key fails
    await assertFails(editor.collection('shares').doc('share-tight-1').update({
        extraKey: 'illegal'
    }));
});

