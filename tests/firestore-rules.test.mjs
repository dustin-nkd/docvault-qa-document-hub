import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    initializeTestEnvironment,
    assertFails
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'docvault-qa-team';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(__dirname, '../firestore.rules');
const rules = fs.readFileSync(rulesPath, 'utf8');

let testEnv;

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules
        }
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

test('anonymous user cannot read any document', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const db = unauthed.firestore();

    await assertFails(db.collection('documents').doc('doc-1').get());
    await assertFails(db.collection('documents').get());
    await assertFails(db.collection('meta').doc('team').get());
    await assertFails(db.collection('members').doc('any-user').get());
    await assertFails(db.collection('shares').doc('share-1').get());
    await assertFails(db.collection('images').doc('img-1').get());
    await assertFails(db.collection('activity').doc('act-1').get());
    await assertFails(db.collection('counters').doc('bugs').get());
});

test('anonymous user cannot write to any document', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const db = unauthed.firestore();

    await assertFails(db.collection('documents').doc('doc-1').set({ title: 'Unauth doc' }));
    await assertFails(db.collection('documents').add({ title: 'Unauth add' }));
    await assertFails(db.collection('meta').doc('team').set({ ownerUid: 'anon' }));
    await assertFails(db.collection('members').doc('anon').set({ role: 'owner' }));
    await assertFails(db.collection('shares').doc('share-1').set({ docId: 'doc-1' }));
    await assertFails(db.collection('images').doc('img-1').set({ data: 'abc' }));
    await assertFails(db.collection('activity').doc('act-1').set({ action: 'test' }));
    await assertFails(db.collection('counters').doc('bugs').set({ next: 1 }));
});

test('authenticated user cannot read any document under deny-all rules', async () => {
    const authed = testEnv.authenticatedContext('user-123', {
        email: 'tester@example.com'
    });
    const db = authed.firestore();

    await assertFails(db.collection('documents').doc('doc-1').get());
    await assertFails(db.collection('documents').get());
    await assertFails(db.collection('meta').doc('team').get());
    await assertFails(db.collection('members').doc('user-123').get());
    await assertFails(db.collection('shares').doc('share-1').get());
    await assertFails(db.collection('images').doc('img-1').get());
    await assertFails(db.collection('activity').doc('act-1').get());
    await assertFails(db.collection('counters').doc('bugs').get());
});

test('authenticated user cannot write to any document under deny-all rules', async () => {
    const authed = testEnv.authenticatedContext('user-123', {
        email: 'tester@example.com'
    });
    const db = authed.firestore();

    await assertFails(db.collection('documents').doc('doc-1').set({ title: 'Auth doc', version: 1 }));
    await assertFails(db.collection('documents').add({ title: 'Auth add' }));
    await assertFails(db.collection('meta').doc('team').set({ ownerUid: 'user-123' }));
    await assertFails(db.collection('members').doc('user-123').set({ role: 'owner' }));
    await assertFails(db.collection('shares').doc('share-1').set({ docId: 'doc-1' }));
    await assertFails(db.collection('images').doc('img-1').set({ data: 'abc' }));
    await assertFails(db.collection('activity').doc('act-1').set({ action: 'test' }));
    await assertFails(db.collection('counters').doc('bugs').set({ next: 1 }));
});
