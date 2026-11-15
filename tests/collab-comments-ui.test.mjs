import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createViewerContext(options = {}) {
    const isCollab = options.collabMode !== undefined ? options.collabMode : true;
    const isShared = options.sharedView !== undefined ? options.sharedView : false;
    const initialDocs = options.documents || [];
    const currentUser = options.currentUser || null;

    const domElements = new Map();
    const mockDocument = {
        getElementById: (id) => domElements.get(id) || null,
        querySelector: (sel) => null,
        querySelectorAll: (sel) => []
    };

    const ctx = {
        console,
        COLLAB_MODE: isCollab,
        state: {
            editingDoc: options.editingDoc || initialDocs[0] || null,
            sharedView: isShared,
            view: 'viewer'
        },
        documents: initialDocs,
        URLSearchParams,
        location: { search: '' },
        _collabCurrentUser: currentUser,
        _collabMembers: options.members || [
            { uid: 'u-alice', displayName: 'Alice Dev', email: 'alice@example.com', role: 'editor' },
            { uid: 'u-bob', displayName: 'Bob QA', email: 'bob@example.com', role: 'viewer' },
            { uid: 'u-carol', displayName: 'Carol Owner', email: 'carol@example.com', role: 'owner' }
        ],
        document: mockDocument
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    const context = vm.createContext(ctx);

    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/collab-comments.js',
        'js/state.js',
        'js/render-core.js',
        'js/render-viewer-categories.js',
        'js/render-viewer.js'
    ];

    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }

    // Re-assign explicitly inside context
    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);
    if (options.editingDoc) {
        context._editingDoc = options.editingDoc;
        vm.runInContext('state.editingDoc = _editingDoc;', context);
    } else if (initialDocs[0]) {
        vm.runInContext('state.editingDoc = documents[0];', context);
    }
    vm.runInContext(`state.sharedView = ${Boolean(isShared)};`, context);
    vm.runInContext(`COLLAB_MODE = ${Boolean(isCollab)};`, context);

    if (currentUser) {
        context._collabCurrentUser = currentUser;
        if (context.CollabComments?.init) {
            context.CollabComments.init(null, { uid: currentUser.uid, displayName: currentUser.displayName, email: currentUser.email }, currentUser);
        }
    }

    return {
        context,
        domElements,
        render: (doc, isSharedOverride) => {
            if (doc) {
                context._tempDoc = doc;
                vm.runInContext(`
                    state.editingDoc = _tempDoc;
                    if (!documents.some(d => d.id === _tempDoc.id)) {
                        documents.push(_tempDoc);
                    }
                `, context);
            }
            if (isSharedOverride !== undefined) {
                vm.runInContext(`state.sharedView = ${Boolean(isSharedOverride)};`, context);
            }
            return vm.runInContext('renderViewer()', context);
        }
    };
}

// -------------------------------------------------------------
// Requirement 1: In COLLAB_MODE, viewing bug doc renders #collab-comments-section
// -------------------------------------------------------------
test('1. In COLLAB_MODE, viewing bug doc renders #collab-comments-section', () => {
    const bugDoc = {
        id: 'bug-101',
        title: 'Checkout button unresponsive on Mobile Safari',
        category: 'bug',
        status: 'open',
        bugData: { severity: 'Critical', steps: 'Click checkout' },
        createdAt: 1700000000000,
        updatedAt: 1700001000000
    };
    const { render } = createViewerContext({
        collabMode: true,
        documents: [bugDoc],
        editingDoc: bugDoc
    });

    const html = render();
    assert.match(html, /<section id="collab-comments-section"/, 'Should render #collab-comments-section');
    assert.match(html, /data-doc-id="bug-101"/, 'Section should carry data-doc-id');
    assert.match(html, /Comments &amp; Discussion/, 'Should render section header');
    assert.match(html, /class="collab-comments-count/, 'Should render comment count badge');
    assert.match(html, /id="collab-root-comment-input"/, 'Should render root comment input');
    assert.match(html, /Leave a comment or type @ to mention\.\.\./, 'Textarea should have correct placeholder');
});

// -------------------------------------------------------------
// Requirement 2: In COLLAB_MODE, viewing task doc renders #collab-comments-section
// -------------------------------------------------------------
test('2. In COLLAB_MODE, viewing task doc renders #collab-comments-section', () => {
    const taskDoc = {
        id: 'task-202',
        title: 'Upgrade Playwright to v1.45',
        category: 'task',
        status: 'in-progress',
        taskData: { kanbanStatus: 'in-progress', priority: 'High' },
        createdAt: 1700000000000,
        updatedAt: 1700001000000
    };
    const { render } = createViewerContext({
        collabMode: true,
        documents: [taskDoc],
        editingDoc: taskDoc
    });

    const html = render();
    assert.match(html, /<section id="collab-comments-section"/, 'Should render #collab-comments-section for task');
    assert.match(html, /data-doc-id="task-202"/, 'Section should carry task data-doc-id');
    assert.match(html, /Comments &amp; Discussion/, 'Should render Comments & Discussion header');
});

// -------------------------------------------------------------
// Requirement 3: When isCollabMode() is false (personal mode), comments section is never rendered
// -------------------------------------------------------------
test('3. When isCollabMode() is false (personal mode), comments section is never rendered', () => {
    const bugDoc = { id: 'bug-1', title: 'Bug 1', category: 'bug', status: 'open' };
    const taskDoc = { id: 'task-1', title: 'Task 1', category: 'task', status: 'todo' };

    const { render, context } = createViewerContext({
        collabMode: false,
        documents: [bugDoc, taskDoc],
        editingDoc: bugDoc
    });

    const bugHtml = render(bugDoc);
    assert.doesNotMatch(bugHtml, /id="collab-comments-section"/, 'Personal mode must not render comments on bug');
    assert.doesNotMatch(bugHtml, /collab-comment/, 'Personal mode must not render any comment markup');

    const taskHtml = render(taskDoc);
    assert.doesNotMatch(taskHtml, /id="collab-comments-section"/, 'Personal mode must not render comments on task');
    assert.doesNotMatch(taskHtml, /collab-comment/, 'Personal mode must not render any comment markup');
});

// -------------------------------------------------------------
// Requirement 4: For non-bug/task categories, comments section is never rendered
// -------------------------------------------------------------
test('4. For non-bug/task categories (credential, runbook, testcases, testrun, release), comments section is never rendered', () => {
    const nonCollabCategories = [
        { id: 'cred-1', title: 'DB Credentials', category: 'credential', status: 'active' },
        { id: 'rb-1', title: 'Deployment Runbook', category: 'runbook', status: 'published' },
        { id: 'tc-1', title: 'Login Test Case', category: 'testcases', status: 'published' },
        { id: 'tr-1', title: 'Sprint 10 Run', category: 'testrun', status: 'published' },
        { id: 'rel-1', title: 'Release v1.2.0', category: 'release', status: 'published' }
    ];

    const { render } = createViewerContext({
        collabMode: true,
        documents: nonCollabCategories,
        editingDoc: nonCollabCategories[0]
    });

    for (const doc of nonCollabCategories) {
        const html = render(doc);
        assert.doesNotMatch(
            html,
            /id="collab-comments-section"/,
            `Category "${doc.category}" must never render collab comments section`
        );
    }
});

// -------------------------------------------------------------
// Requirement 5: When state.sharedView = true, comments section is omitted
// -------------------------------------------------------------
test('5. When state.sharedView = true, comments section is omitted', () => {
    const bugDoc = { id: 'bug-pub', title: 'Public Shared Bug', category: 'bug', status: 'open' };
    const taskDoc = { id: 'task-pub', title: 'Public Shared Task', category: 'task', status: 'in-progress' };

    const { render } = createViewerContext({
        collabMode: true,
        sharedView: true,
        documents: [bugDoc, taskDoc],
        editingDoc: bugDoc
    });

    const bugHtml = render(bugDoc, true);
    assert.doesNotMatch(bugHtml, /id="collab-comments-section"/, 'Shared view must omit comments on bug');

    const taskHtml = render(taskDoc, true);
    assert.doesNotMatch(taskHtml, /id="collab-comments-section"/, 'Shared view must omit comments on task');
});

// -------------------------------------------------------------
// Requirement 6: Comments render author avatar, name, content, and reply thread
// -------------------------------------------------------------
test('6. Comments render author avatar, name, content, (edited) tag, and reply thread', () => {
    const bugDoc = {
        id: 'bug-threaded',
        title: 'Threaded Discussion Bug',
        category: 'bug',
        status: 'open',
        comments: [
            {
                id: 'cmt-root-1',
                docId: 'bug-threaded',
                parentId: null,
                authorUid: 'u-alice',
                authorName: 'Alice Developer',
                authorRole: 'editor',
                content: 'I reproduced this bug when mentioning @[Bob QA](u-bob). Please verify.',
                createdAt: 1700000000000,
                updatedAt: 1700001000000, // Edited
                replies: [
                    {
                        id: 'cmt-reply-1',
                        docId: 'bug-threaded',
                        parentId: 'cmt-root-1',
                        authorUid: 'u-bob',
                        authorName: 'Bob QA',
                        authorRole: 'viewer',
                        content: 'Verified on staging! Still happens in build #42.',
                        createdAt: 1700002000000,
                        updatedAt: null // Not edited
                    }
                ]
            }
        ]
    };

    const { render } = createViewerContext({
        collabMode: true,
        documents: [bugDoc],
        editingDoc: bugDoc,
        currentUser: { uid: 'u-alice', displayName: 'Alice Developer', role: 'editor' }
    });

    const html = render();

    // 1. Root comment rendering
    assert.match(html, /class="[^"]*collab-comment-card[^"]*"/, 'Should render comment card');
    assert.match(html, /data-comment-id="cmt-root-1"/, 'Should render root comment id');
    assert.match(html, /class="[^"]*collab-comment-avatar[^"]*"[^>]*>AD<\/div>/, 'Alice avatar initials "AD"');
    assert.match(html, /Alice Developer/, 'Should render author Alice Developer');
    assert.match(html, /class="[^"]*collab-comment-role[^"]*"[^>]*>editor<\/span>/, 'Should render Alice role editor');
    assert.match(html, /\(edited\)/, 'Should render (edited) indicator for updated comment');

    // 2. Mention badge in comment body
    assert.match(html, /<span class="collab-mention-chip">@Bob QA<\/span>/, 'Should format @[Bob QA](u-bob) mention chip');

    // 3. Nested reply thread rendering
    assert.match(html, /class="[^"]*collab-reply-thread[^"]*"/, 'Should render .collab-reply-thread');
    assert.match(html, /data-comment-id="cmt-reply-1"/, 'Should render reply comment id');
    assert.match(html, /class="[^"]*collab-comment-avatar[^"]*"[^>]*>BQ<\/div>/, 'Bob avatar initials "BQ"');
    assert.match(html, /Bob QA/, 'Should render author Bob QA');
    assert.match(html, /Verified on staging! Still happens in build #42\./, 'Should render Bob reply content');

    // 4. Comment count (1 root + 1 reply = 2)
    assert.match(html, /class="collab-comments-count[^"]*"[^>]*>2<\/span>/, 'Count badge should display 2');
});

// -------------------------------------------------------------
// Requirement 7: Edit/Delete buttons are displayed only when user is author (or team owner for delete)
// -------------------------------------------------------------
test('7. Edit/Delete buttons are displayed only when user is author (or team owner for delete)', () => {
    const commentsFixture = [
        {
            id: 'cmt-alice',
            docId: 'bug-perms',
            parentId: null,
            authorUid: 'u-alice',
            authorName: 'Alice Dev',
            content: 'Alice comment',
            createdAt: 1700000000000,
            replies: [
                {
                    id: 'cmt-bob',
                    docId: 'bug-perms',
                    parentId: 'cmt-alice',
                    authorUid: 'u-bob',
                    authorName: 'Bob QA',
                    content: 'Bob reply',
                    createdAt: 1700001000000
                }
            ]
        }
    ];

    const bugDoc = {
        id: 'bug-perms',
        title: 'Permissions Bug',
        category: 'bug',
        status: 'open',
        comments: commentsFixture
    };

    // Sub-case A: Logged in as Alice (author of cmt-alice, not cmt-bob; editor, not owner)
    {
        const { render } = createViewerContext({
            collabMode: true,
            documents: [bugDoc],
            editingDoc: bugDoc,
            currentUser: { uid: 'u-alice', displayName: 'Alice Dev', role: 'editor' }
        });
        const html = render();

        // Alice's comment (cmt-alice): author can edit and delete
        assert.match(html, /collabEditComment\((&quot;|')cmt-alice(&quot;|')\)/, 'Alice should see Edit on her comment');
        assert.match(html, /collabDeleteComment\((&quot;|')cmt-alice(&quot;|')/, 'Alice should see Delete on her comment');

        // Bob's comment (cmt-bob): Alice is not author and not owner, cannot edit or delete
        assert.doesNotMatch(html, /collabEditComment\((&quot;|')cmt-bob(&quot;|')\)/, 'Alice cannot edit Bobs comment');
        assert.doesNotMatch(html, /collabDeleteComment\((&quot;|')cmt-bob(&quot;|')/, 'Alice cannot delete Bobs comment');
    }

    // Sub-case B: Logged in as Carol (team owner, author of neither)
    {
        const { render } = createViewerContext({
            collabMode: true,
            documents: [bugDoc],
            editingDoc: bugDoc,
            currentUser: { uid: 'u-carol', displayName: 'Carol Owner', role: 'owner' }
        });
        const html = render();

        // Owner cannot edit other members' comments
        assert.doesNotMatch(html, /collabEditComment\((&quot;|')cmt-alice(&quot;|')\)/, 'Owner cannot edit Alice comment');
        assert.doesNotMatch(html, /collabEditComment\((&quot;|')cmt-bob(&quot;|')\)/, 'Owner cannot edit Bob comment');

        // Owner CAN delete any comment
        assert.match(html, /collabDeleteComment\((&quot;|')cmt-alice(&quot;|')/, 'Owner can delete Alice comment');
        assert.match(html, /collabDeleteComment\((&quot;|')cmt-bob(&quot;|')/, 'Owner can delete Bob comment');
    }

    // Sub-case C: Logged in as Dave (viewer, non-author, non-owner)
    {
        const { render } = createViewerContext({
            collabMode: true,
            documents: [bugDoc],
            editingDoc: bugDoc,
            currentUser: { uid: 'u-dave', displayName: 'Dave Viewer', role: 'viewer' }
        });
        const html = render();

        // Dave has no edit or delete on either comment
        assert.doesNotMatch(html, /collabEditComment\((&quot;|')cmt-alice(&quot;|')\)/, 'Dave cannot edit Alice comment');
        assert.doesNotMatch(html, /collabDeleteComment\((&quot;|')cmt-alice(&quot;|')/, 'Dave cannot delete Alice comment');
        assert.doesNotMatch(html, /collabEditComment\((&quot;|')cmt-bob(&quot;|')\)/, 'Dave cannot edit Bob comment');
        assert.doesNotMatch(html, /collabDeleteComment\((&quot;|')cmt-bob(&quot;|')/, 'Dave cannot delete Bob comment');

        // Dave CAN reply
        assert.match(html, /collabToggleReplyForm\((&quot;|')cmt-alice(&quot;|')\)/, 'Dave can reply to comment');
    }
});

// -------------------------------------------------------------
// Requirement 8: Global Action Handlers Contract & Mention Autocomplete
// -------------------------------------------------------------
test('8. Global action handlers contract and lifecycle cleanup', async () => {
    const bugDoc = {
        id: 'bug-actions',
        title: 'Action Handlers Bug',
        category: 'bug',
        status: 'open'
    };

    let addedComment = null;
    let updatedComment = null;
    let deletedComment = null;
    let unsubCalled = false;

    const { context, domElements, render } = createViewerContext({
        collabMode: true,
        documents: [bugDoc],
        editingDoc: bugDoc,
        currentUser: { uid: 'u-alice', displayName: 'Alice Dev', role: 'editor' }
    });

    // Mock CollabComments service methods
    context.CollabComments.addComment = async (docId, data) => {
        addedComment = { docId, ...data };
        return { id: 'cmt-new', ...data };
    };
    context.CollabComments.updateComment = async (docId, commentId, data) => {
        updatedComment = { docId, commentId, ...data };
        return { id: commentId, ...data };
    };
    context.CollabComments.deleteComment = async (docId, commentId) => {
        deletedComment = { docId, commentId };
        return true;
    };
    context.CollabComments.subscribe = (docId, onUpdate) => {
        return () => { unsubCalled = true; };
    };

    // 1. Initial render triggers subscribe
    render();

    // Verify global handlers exist on window
    assert.equal(typeof context.window.collabSubmitComment, 'function');
    assert.equal(typeof context.window.collabSubmitReply, 'function');
    assert.equal(typeof context.window.collabEditComment, 'function');
    assert.equal(typeof context.window.collabDeleteComment, 'function');
    assert.equal(typeof context.window.collabToggleReplyForm, 'function');
    assert.equal(typeof context.window.cleanupCollabCommentsSubscription, 'function');

    // 2. Submit comment handler
    const mockRootInput = { value: 'Bug reproduction confirmed @[Bob QA](u-bob)' };
    domElements.set('collab-root-comment-input', mockRootInput);

    await context.window.collabSubmitComment('bug-actions');
    assert.ok(addedComment, 'addComment should have been called');
    assert.equal(addedComment.docId, 'bug-actions');
    assert.equal(addedComment.content, 'Bug reproduction confirmed @[Bob QA](u-bob)');
    assert.deepEqual([...addedComment.mentions], ['u-bob']);
    assert.equal(mockRootInput.value, '', 'Input should be cleared on success');

    // 3. Submit reply handler
    const mockReplyInput = { value: 'Replying with details' };
    domElements.set('collab-reply-input-cmt-root-1', mockReplyInput);
    const mockReplyForm = { style: { display: 'block' } };
    domElements.set('collab-reply-form-cmt-root-1', mockReplyForm);

    await context.window.collabSubmitReply('bug-actions', 'cmt-root-1');
    assert.ok(addedComment, 'addComment for reply should have been called');
    assert.equal(addedComment.parentId, 'cmt-root-1');
    assert.equal(addedComment.content, 'Replying with details');
    assert.equal(mockReplyInput.value, '', 'Reply input cleared');
    assert.equal(mockReplyForm.style.display, 'none', 'Reply form closed');

    // 4. Edit comment programmatic handler
    await context.window.collabEditComment('cmt-root-1', 'bug-actions', 'Updated content text');
    assert.ok(updatedComment, 'updateComment should have been called');
    assert.equal(updatedComment.commentId, 'cmt-root-1');
    assert.equal(updatedComment.content, 'Updated content text');

    // 5. Delete comment handler
    context.window.confirm = () => true;
    await context.window.collabDeleteComment('cmt-root-1', 'bug-actions');
    assert.ok(deletedComment, 'deleteComment should have been called');
    assert.equal(deletedComment.commentId, 'cmt-root-1');

    // 6. Mention autocomplete interaction
    const mockTa = {
        value: 'Hello @bo',
        selectionStart: 9,
        focus: () => {}
    };
    domElements.set('collab-root-comment-input', mockTa);
    const mockDropdown = {
        innerHTML: '',
        style: { display: 'none' }
    };
    domElements.set('collab-mention-dropdown-root', mockDropdown);

    context.window.collabHandleMentionInput(mockTa, 'root');
    assert.equal(mockDropdown.style.display, 'block', 'Dropdown should open for @bo query');
    assert.match(mockDropdown.innerHTML, /Bob QA/, 'Dropdown should contain filtered Bob QA');
    assert.doesNotMatch(mockDropdown.innerHTML, /Alice Dev/, 'Dropdown should exclude current user Alice');

    // Select mention
    context.window.collabSelectMention('root', 'u-bob', 'Bob QA');
    assert.equal(mockDropdown.style.display, 'none', 'Dropdown should close on selection');
    assert.equal(mockTa.value, 'Hello @[Bob QA](u-bob) ', 'Mention token inserted into textarea');

    // 7. Cleanup subscription on navigation away
    context.window.cleanupCollabCommentsSubscription();
    assert.equal(unsubCalled, true, 'cleanupCollabCommentsSubscription should call unsub()');
});
