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
