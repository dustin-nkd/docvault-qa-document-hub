import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createCommentsTestContext(options = {}) {
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        Math,
        Set,
        Map,
        RegExp,
        JSON,
        Promise,
        Error,
        state: { docs: [] }
    };
    context.window = context;
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(read('js/collab-comments.js'), context, { filename: 'js/collab-comments.js' });
    return context;
}

test('1. Line budget check: js/collab-comments.js is under 400 lines', () => {
    const content = read('js/collab-comments.js');
    const lines = content.split(/\r?\n/).length;
    assert.ok(lines <= 400, `js/collab-comments.js must not exceed 400 lines (got ${lines})`);
});

test('2. CollabComments export and method contract', () => {
    const ctx = createCommentsTestContext();
    const comments = ctx.CollabComments;
    assert.ok(comments, 'CollabComments must be exported on root');

    const expectedMethods = [
        'init',
        'subscribe',
        'addComment',
        'updateComment',
        'deleteComment',
        'buildCommentTree',
        'extractMentions',
        'formatCommentContent',
        'notifyCommentMention'
    ];

    for (const method of expectedMethods) {
        assert.equal(typeof comments[method], 'function', `CollabComments.${method} must be a function`);
    }
});

test('3. buildCommentTree: organizes roots and groups child replies under parent', () => {
    const ctx = createCommentsTestContext();
    const { buildCommentTree } = ctx.CollabComments;

    const flatComments = [
        { id: 'cmt-2', docId: 'doc-1', parentId: 'cmt-1', content: 'First reply', createdAt: 200 },
        { id: 'cmt-1', docId: 'doc-1', parentId: null, content: 'Root comment 1', createdAt: 100 },
        { id: 'cmt-3', docId: 'doc-1', parentId: null, content: 'Root comment 2', createdAt: 300 },
        { id: 'cmt-4', docId: 'doc-1', parentId: 'cmt-1', content: 'Second reply to root 1', createdAt: 250 },
        { id: 'cmt-5', docId: 'doc-1', parentId: 'cmt-3', content: 'Reply to root 2', createdAt: 350 }
    ];

    const tree = buildCommentTree(flatComments);
    assert.equal(tree.length, 2, 'Should have exactly 2 root comments');

    // First root
    assert.equal(tree[0].id, 'cmt-1');
    assert.equal(tree[0].replies.length, 2);
    assert.equal(tree[0].replies[0].id, 'cmt-2');
    assert.equal(tree[0].replies[1].id, 'cmt-4');

    // Second root
    assert.equal(tree[1].id, 'cmt-3');
    assert.equal(tree[1].replies.length, 1);
    assert.equal(tree[1].replies[0].id, 'cmt-5');

    // Edge cases
    assert.equal(buildCommentTree(null).length, 0);
    assert.equal(buildCommentTree([]).length, 0);
});

test('4. extractMentions: parses plain @Name and markdown @[Name](uid), ignores current user, deduplicates', () => {
    const ctx = createCommentsTestContext();
    const { init, extractMentions } = ctx.CollabComments;

    const members = [
        { uid: 'u-alice', displayName: 'Alice Smith', email: 'alice@example.com' },
        { uid: 'u-bob', displayName: 'Bob', email: 'bob@example.com' },
        { uid: 'u-charlie', displayName: 'Charlie Brown', email: 'charlie@example.com' },
        { uid: 'u-current', displayName: 'Current User', email: 'me@example.com' }
    ];

    init(null, { uid: 'u-current' }, { uid: 'u-current', displayName: 'Current User' });

    // Matching plain @DisplayName
    const mentions1 = extractMentions('Hey @Alice Smith and @Bob, please check this!', members);
    assert.deepEqual(mentions1.sort(), ['u-alice', 'u-bob']);

    // Matching explicit @[Name](uid)
    const mentions2 = extractMentions('FYI @[Charlie Brown](u-charlie), see ticket.', members);
    assert.deepEqual(mentions2, ['u-charlie']);

    // Excludes current user self-mentions
    const mentionsSelf = extractMentions('Hey @Current User and @Bob', members);
    assert.deepEqual(mentionsSelf, ['u-bob']);

    // Deduplication
    const mentionsDedup = extractMentions('@Bob and again @Bob plus @[Bob](u-bob)', members);
    assert.deepEqual(mentionsDedup, ['u-bob']);

    // Empty or non-string input
    assert.equal(extractMentions('', members).length, 0);
    assert.equal(extractMentions(null, members).length, 0);
});

test('5. formatCommentContent: escapes malicious HTML script tags and formats mention chips', () => {
    const ctx = createCommentsTestContext();
    const { formatCommentContent } = ctx.CollabComments;

    const membersMap = new Map([
        ['u-alice', { uid: 'u-alice', displayName: 'Alice Smith', email: 'alice@example.com' }],
        ['u-bob', { uid: 'u-bob', displayName: 'Bob', email: 'bob@example.com' }]
    ]);

    // XSS sanitization
    const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)> @Bob';
    const formattedXss = formatCommentContent(malicious, membersMap);
    assert.ok(!formattedXss.includes('<script>'), 'Must escape script tag');
    assert.ok(!formattedXss.includes('<img'), 'Must escape img tag');
    assert.ok(formattedXss.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
    assert.ok(formattedXss.includes('<span class="collab-mention-chip">@Bob</span>'));

    // Mention chip formatting with plain @DisplayName
    const textPlain = 'Hello @Alice Smith, great work!';
    const formattedPlain = formatCommentContent(textPlain, membersMap);
    assert.ok(formattedPlain.includes('<span class="collab-mention-chip">@Alice Smith</span>'));

    // Mention chip formatting with markdown format @[Name](uid)
    const textMd = 'Please review @[Alice](u-alice)';
    const formattedMd = formatCommentContent(textMd, membersMap);
    assert.ok(formattedMd.includes('<span class="collab-mention-chip">@Alice Smith</span>'));

    // Empty/invalid input handling
    assert.equal(formatCommentContent(null), '');
    assert.equal(formatCommentContent(''), '');
});

test('6. sw.js cache verification: APP_SHELL contains ./js/collab-comments.js', () => {
    const sw = read('sw.js');
    assert.ok(
        sw.includes("'./js/collab-comments.js'") || sw.includes('"./js/collab-comments.js"'),
        "sw.js APP_SHELL must cache './js/collab-comments.js'"
    );
});

test('7. collab-bootstrap.js integration: loads and references loadCollabComments', () => {
    const bootstrap = read('js/collab-bootstrap.js');
    assert.ok(bootstrap.includes('function loadCollabComments()'), 'Must define loadCollabComments()');
    assert.ok(bootstrap.includes("s.src = 'js/collab-comments.js'"), 'Must load js/collab-comments.js');
    assert.ok(bootstrap.includes('loadCollabComments()'), 'Must invoke loadCollabComments()');
    assert.ok(bootstrap.includes('loadCollabComments,'), 'Must export loadCollabComments on CollabBootstrap');
});

test('8. notifyCommentMention: constructs valid notification payload with kind comment_mention', async () => {
    const ctx = createCommentsTestContext();
    const { init, notifyCommentMention } = ctx.CollabComments;

    let savedNotif = null;
    const mockDb = {
        collection: (name) => {
            assert.equal(name, 'notifications');
            return {
                doc: (id) => ({
                    set: async (payload) => {
                        savedNotif = { id, ...payload };
                    }
                })
            };
        }
    };

    init(mockDb, { uid: 'u-author' }, { uid: 'u-author', displayName: 'Author User', email: 'author@example.com' });

    const doc = { id: 'doc-42', title: 'Critical Auth Bug' };
    const comment = {
        id: 'cmt-100',
        authorUid: 'u-author',
        authorName: 'Author User',
        authorEmail: 'author@example.com'
    };

    const res = await notifyCommentMention(doc, comment, 'u-recipient');
    assert.ok(res, 'Should return notification payload');
    assert.ok(savedNotif, 'Should write notification document');
    assert.equal(savedNotif.kind, 'comment_mention');
    assert.equal(savedNotif.recipientUid, 'u-recipient');
    assert.equal(savedNotif.actorUid, 'u-author');
    assert.equal(savedNotif.actorName, 'Author User');
    assert.equal(savedNotif.actorEmail, 'author@example.com');
    assert.equal(savedNotif.docId, 'doc-42');
    assert.equal(savedNotif.docTitle, 'Critical Auth Bug');
    assert.equal(savedNotif.signalKey, '');
    assert.equal(savedNotif.readAt, null);
    assert.equal(typeof savedNotif.createdAt, 'number');

    // Self-mention should NOT dispatch notification
    savedNotif = null;
    const selfRes = await notifyCommentMention(doc, comment, 'u-author');
    assert.equal(selfRes, null);
    assert.equal(savedNotif, null);
});

test('9. addComment, updateComment, and deleteComment operations with schema validation', async () => {
    const ctx = createCommentsTestContext();
    const { init, addComment, updateComment, deleteComment } = ctx.CollabComments;

    const commentsStore = new Map();
    const notifsStore = new Map();

    const mockDb = {
        collection: (col) => {
            if (col === 'documents') {
                return {
                    doc: (dId) => ({
                        collection: (subCol) => {
                            assert.equal(subCol, 'comments');
                            return {
                                doc: (cId) => ({
                                    set: async (data) => { commentsStore.set(cId, data); },
                                    update: async (patch) => {
                                        const prev = commentsStore.get(cId) || {};
                                        commentsStore.set(cId, { ...prev, ...patch });
                                    },
                                    delete: async () => { commentsStore.delete(cId); }
                                })
                            };
                        }
                    })
                };
            }
            if (col === 'notifications') {
                return {
                    doc: (nId) => ({
                        set: async (data) => { notifsStore.set(nId, data); }
                    })
                };
            }
            throw new Error('Unknown collection: ' + col);
        }
    };

    init(mockDb, { uid: 'u-1' }, { uid: 'u-1', displayName: 'Tester', email: 'tester@test.com' });

    // 1. Validation: empty content rejected
    await assert.rejects(
        () => addComment('doc-1', { content: '' }),
        /between 1 and 4000 characters/
    );

    // 2. Validation: oversized content rejected
    await assert.rejects(
        () => addComment('doc-1', { content: 'a'.repeat(4001) }),
        /between 1 and 4000 characters/
    );

    // 3. Add valid comment with mentions
    const created = await addComment('doc-1', {
        content: 'Please verify @[Dev](u-2)',
        mentions: ['u-2']
    }, { id: 'doc-1', title: 'Test Bug' });

    assert.ok(created.id.startsWith('cmt_'));
    assert.equal(created.docId, 'doc-1');
    assert.equal(created.authorUid, 'u-1');
    assert.equal(created.authorName, 'Tester');
    assert.equal(created.content, 'Please verify @[Dev](u-2)');
    assert.deepEqual(created.mentions, ['u-2']);
    assert.equal(created.updatedAt, null);
    assert.ok(commentsStore.has(created.id));

    // Mention notification was dispatched
    assert.equal(notifsStore.size, 1);
    const notif = Array.from(notifsStore.values())[0];
    assert.equal(notif.recipientUid, 'u-2');
    assert.equal(notif.kind, 'comment_mention');

    // 4. Update comment
    await updateComment('doc-1', created.id, {
        content: 'Updated content',
        mentions: ['u-2', 'u-3']
    });
    const updated = commentsStore.get(created.id);
    assert.equal(updated.content, 'Updated content');
    assert.deepEqual(updated.mentions, ['u-2', 'u-3']);
    assert.equal(typeof updated.updatedAt, 'number');

    // 5. Delete comment
    await deleteComment('doc-1', created.id);
    assert.equal(commentsStore.has(created.id), false);
});
