import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createViewerCategoryRenderer(initialDocs = [], sharedView = false) {
    const context = vm.createContext({
        console,
        window: {},
        state: { sharedView },
        URLSearchParams,
        location: { search: '' }
    });
    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-core.js',
        'js/render-viewer-categories.js',
        'js/render-viewer.js'
    ];
    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }
    context.renderContent = () => {};
    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);
    vm.runInContext(`state.sharedView = ${Boolean(sharedView)};`, context);

    return {
        render: (doc, isShared) => {
            if (isShared !== undefined) {
                vm.runInContext(`state.sharedView = ${Boolean(isShared)};`, context);
            }
            context._doc = doc;
            return vm.runInContext('renderViewerCategory(_doc)', context);
        }
    };
}

test('Task view: in-progress task with empty content renders In Progress badge, color #3b82f6, no viewer-container, no Move to', () => {
    const task = {
        id: 'task-1',
        title: 'Investigate payment issue',
        category: 'task',
        status: 'published',
        kanbanStatus: 'in-progress',
        content: ''
    };
    const renderer = createViewerCategoryRenderer([task]);
    const html = renderer.render(task, false);

    assert.ok(html.includes('In Progress'), 'renders In Progress');
    assert.ok(html.includes('#3b82f6'), 'renders color #3b82f6');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container when content is empty');
    assert.ok(!html.includes('Move to'), 'does not render Move to button');
});

test('Task view: kanban columns render exact labels and colors (todo, review, done)', () => {
    const renderer = createViewerCategoryRenderer();

    const todoTask = { id: 't-todo', title: 'Task Todo', category: 'task', status: 'draft', kanbanStatus: 'todo', content: '' };
    const htmlTodo = renderer.render(todoTask);
    assert.ok(htmlTodo.includes('To Do'), 'renders To Do');
    assert.ok(htmlTodo.includes('#64748b'), 'renders color #64748b');

    const reviewTask = { id: 't-review', title: 'Task Review', category: 'task', status: 'draft', kanbanStatus: 'review', content: '' };
    const htmlReview = renderer.render(reviewTask);
    assert.ok(htmlReview.includes('Review'), 'renders Review');
    assert.ok(htmlReview.includes('#f59e0b'), 'renders color #f59e0b');

    const doneTask = { id: 't-done', title: 'Task Done', category: 'task', status: 'draft', kanbanStatus: 'done', content: '' };
    const htmlDone = renderer.render(doneTask);
    assert.ok(htmlDone.includes('Done'), 'renders Done');
    assert.ok(htmlDone.includes('#10b981'), 'renders color #10b981');
});

test('Task view: missing or unrecognized kanbanStatus defaults to To Do, does not display blocked', () => {
    const renderer = createViewerCategoryRenderer();

    const missingStatusTask = { id: 't-missing', title: 'Task Missing Status', category: 'task', status: 'draft', content: '' };
    const htmlMissing = renderer.render(missingStatusTask);
    assert.ok(htmlMissing.includes('To Do'), 'missing status defaults to To Do');
    assert.ok(htmlMissing.includes('#64748b'), 'missing status has #64748b');

    const blockedTask = { id: 't-blocked', title: 'Task Blocked', category: 'task', status: 'draft', kanbanStatus: 'blocked', content: '' };
    const htmlBlocked = renderer.render(blockedTask);
    assert.ok(htmlBlocked.includes('To Do'), 'blocked status defaults to To Do');
    assert.ok(!htmlBlocked.includes('blocked'), 'does not display raw blocked');
});

test('Task view: task with non-empty content renders column badge, Notes heading, and exactly one viewer-container', () => {
    const taskWithNotes = {
        id: 'task-notes',
        title: 'Task with notes',
        category: 'task',
        status: 'published',
        kanbanStatus: 'todo',
        content: '## Wrote the retry cases'
    };
    const renderer = createViewerCategoryRenderer([taskWithNotes]);
    const html = renderer.render(taskWithNotes);

    assert.ok(html.includes('To Do'), 'renders column label');
    assert.ok(html.includes('Notes'), 'renders Notes label');

    const matches = html.match(/id="viewer-container"/g);
    assert.ok(matches && matches.length === 1, `expected exactly one viewer-container, got ${matches ? matches.length : 0}`);
});

test('Task view: sharedView preserves status and does not contain data-onclick="viewDoc"', () => {
    const task = {
        id: 'task-shared',
        title: 'Task in shared view',
        category: 'task',
        status: 'published',
        kanbanStatus: 'in-progress',
        content: '## Some notes'
    };
    const renderer = createViewerCategoryRenderer([task]);
    const htmlShared = renderer.render(task, true);

    assert.ok(htmlShared.includes('In Progress'), 'renders In Progress in shared view');
    assert.ok(!htmlShared.includes('data-onclick="viewDoc"'), 'shared view contains no data-onclick="viewDoc"');
});

test('Task view: renders assignee name when present and Unassigned when omitted', () => {
    const renderer = createViewerCategoryRenderer();

    const taskWithAssignee = {
        id: 'task-assigned',
        title: 'Task with assignee',
        category: 'task',
        status: 'published',
        kanbanStatus: 'todo',
        assignee: 'Nguyen Khanh Duy',
        content: ''
    };
    const htmlAssigned = renderer.render(taskWithAssignee);
    assert.ok(htmlAssigned.includes('Nguyen Khanh Duy'), 'renders assignee name');
    assert.ok(htmlAssigned.includes('fa-user'), 'renders user icon');

    const taskUnassigned = {
        id: 'task-unassigned',
        title: 'Task without assignee',
        category: 'task',
        status: 'published',
        kanbanStatus: 'todo',
        content: ''
    };
    const htmlUnassigned = renderer.render(taskUnassigned);
    assert.ok(htmlUnassigned.includes('Unassigned'), 'renders fallback Unassigned');
});

function createKanbanRenderer(initialDocs = [], members = []) {
    const context = vm.createContext({
        console,
        window: {},
        document: { getElementById: () => null },
        state: { taskAssigneeFilter: 'all', search: '', statusFilter: 'all' },
        URLSearchParams,
        location: { search: '' },
        renderContent: () => {}
    });
    context.window = context;
    context.globalThis = context;
    context.renderSelect = (id, options, selectedValue, cls, onChange, label) => {
        const optsStr = (options || []).map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        return `<div class="custom-select ${cls || ''}" data-id="${id}" data-selected="${selectedValue}" data-onchange="${onChange || ''}" aria-label="${label || ''}"><input type="hidden" id="${id}" value="${selectedValue}">${optsStr}</div>`;
    };
    if (members.length > 0) {
        context.CollabAssign = {
            getMembers: () => members,
            getMemberLabel: (m) => m ? (m.displayName ? `${m.displayName} (${m.email})` : m.email) : ''
        };
    }
    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-core.js'
    ];
    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }
    context.renderContent = () => {};
    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);

    return {
        context,
        render: (docs = initialDocs) => {
            context._docsToRender = docs;
            return vm.runInContext('renderKanbanBoard(_docsToRender)', context);
        },
        applyFilter: (val) => {
            vm.runInContext(`applyTaskAssigneeFilter('${val}');`, context);
        }
    };
}

test('Task kanban: renders kb-assignee-filter dropdown with All, Unassigned and member options', () => {
    const members = [
        { uid: 'u1', email: 'alice@example.com', displayName: 'Alice' },
        { uid: 'u2', email: 'bob@example.com', displayName: 'Bob' }
    ];
    const docs = [
        { id: 't1', title: 'Task 1', category: 'task', status: 'published', kanbanStatus: 'todo', assignee: 'Alice', assigneeUid: 'u1', tags: [], updatedAt: Date.now() },
        { id: 't2', title: 'Task 2', category: 'task', status: 'published', kanbanStatus: 'in-progress', assignee: 'Bob', assigneeUid: 'u2', tags: [], updatedAt: Date.now() },
        { id: 't3', title: 'Task 3', category: 'task', status: 'published', kanbanStatus: 'review', tags: [], updatedAt: Date.now() }
    ];
    const helper = createKanbanRenderer(docs, members);
    const html = helper.render();

    assert.ok(html.includes('data-id="kb-assignee-filter"'), 'renders kb-assignee-filter');
    assert.ok(html.includes('All Assignees'), 'contains All Assignees option');
    assert.ok(html.includes('Unassigned'), 'contains Unassigned option');
    assert.ok(html.includes('Alice (alice@example.com)'), 'contains Alice option');
    assert.ok(html.includes('Bob (bob@example.com)'), 'contains Bob option');
    assert.ok(html.includes('applyTaskAssigneeFilter(this.value)'), 'has onChange handler');
});

test('Task kanban: filters tasks by assignee and unassigned', () => {
    const docs = [
        { id: 't1', title: 'Alice Task', category: 'task', status: 'published', kanbanStatus: 'todo', assignee: 'Alice', assigneeUid: 'u1', tags: [], updatedAt: Date.now() },
        { id: 't2', title: 'Bob Task', category: 'task', status: 'published', kanbanStatus: 'todo', assignee: 'Bob', assigneeUid: 'u2', tags: [], updatedAt: Date.now() },
        { id: 't3', title: 'Nobody Task', category: 'task', status: 'published', kanbanStatus: 'todo', tags: [], updatedAt: Date.now() }
    ];
    const helper = createKanbanRenderer(docs);

    // Filter by Alice UID
    helper.applyFilter('u1');
    const htmlAlice = helper.render();
    assert.ok(htmlAlice.includes('Alice Task'), 'includes Alice Task');
    assert.ok(!htmlAlice.includes('Bob Task'), 'excludes Bob Task');
    assert.ok(!htmlAlice.includes('Nobody Task'), 'excludes Nobody Task');

    // Filter by unassigned
    helper.applyFilter('unassigned');
    const htmlUnassigned = helper.render();
    assert.ok(!htmlUnassigned.includes('Alice Task'), 'excludes Alice Task');
    assert.ok(!htmlUnassigned.includes('Bob Task'), 'excludes Bob Task');
    assert.ok(htmlUnassigned.includes('Nobody Task'), 'includes Nobody Task');
});

test('Task kanban: member filter matches both member UID and member name/email fallback', () => {
    const members = [
        { uid: 'u1', email: 'alice@example.com', displayName: 'Alice' }
    ];
    const docs = [
        { id: 't1', title: 'Task with UID', category: 'task', status: 'published', kanbanStatus: 'todo', assignee: 'Alice', assigneeUid: 'u1', tags: [], updatedAt: Date.now() },
        { id: 't2', title: 'Task with name only', category: 'task', status: 'published', kanbanStatus: 'todo', assignee: 'Alice (alice@example.com)', tags: [], updatedAt: Date.now() },
        { id: 't3', title: 'Other Task', category: 'task', status: 'published', kanbanStatus: 'todo', assignee: 'Bob', tags: [], updatedAt: Date.now() }
    ];
    const helper = createKanbanRenderer(docs, members);

    helper.applyFilter('u1');
    const html = helper.render();
    assert.ok(html.includes('Task with UID'), 'matches task with assigneeUid');
    assert.ok(html.includes('Task with name only'), 'matches name-only task whose assignee equals member label');
    assert.ok(!html.includes('Other Task'), 'excludes other task');
});

test('Task kanban: retains active filter option and clearDocumentFilters resets taskAssigneeFilter', () => {
    const members = [{ uid: 'u1', email: 'alice@example.com', displayName: 'Alice' }];
    const helper = createKanbanRenderer([], members);

    helper.applyFilter('u1');
    const html = helper.render([]);
    assert.ok(html.includes('data-selected="u1"'), 'active option is retained even if no tasks exist');

    helper.context.clearDocumentFilters();
    assert.equal(helper.context.state.taskAssigneeFilter, 'all', 'clearDocumentFilters resets taskAssigneeFilter to all');
});

test('Task editor: emits #editor-container and #ed-content-hidden for task category', () => {
    const context = vm.createContext({
        console,
        window: {},
        t: (k) => k,
        escHtml: (s) => s || '',
        renderSelect: () => ''
    });
    context.window = context;
    context.globalThis = context;
    const catCode = fs.readFileSync(path.join(root, 'js/render-editor-categories.js'), 'utf8');
    vm.runInContext(catCode, context);

    const html = context.renderEditorCategory({ category: 'task', content: 'My notes', doc: { content: 'My notes' } });
    assert.ok(html.includes('id="editor-container"'), 'renders editor-container');
    assert.ok(html.includes('id="ed-content-hidden"'), 'renders ed-content-hidden');
    assert.ok(html.includes('My notes'), 'contains content value in ed-content-hidden');
});
