import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createAssignContext(options = {}) {
    const isGuest = Boolean(options.guest);
    const isCollab = options.collab !== false && !isGuest;
    const authUser = options.authUser || { uid: 'user-current', displayName: 'Current User', email: 'current@example.com' };
    const currentMember = options.currentMember || { uid: authUser.uid, displayName: authUser.displayName, email: authUser.email, role: options.role || 'editor' };

    const membersStore = new Map(options.initialMembers || [
        ['user-1', { uid: 'user-1', displayName: 'Alice QA', email: 'alice@example.com', role: 'editor' }],
        ['user-2', { uid: 'user-2', displayName: '', email: 'Bob.Lead@example.com', role: 'viewer' }],
        ['user-3', { uid: 'user-3', displayName: 'Charlie Owner', email: 'charlie@example.com', role: 'owner' }],
        ['user-invited', { uid: 'user-invited', displayName: 'Invited Guy', email: 'invited@example.com', role: 'invited' }]
    ]);

    const notifStore = new Map(options.initialNotifications || []);
    const notifSets = [];
    const notifUpdates = [];

    const firestoreMock = {
        collection: (colName) => {
            if (colName === 'members') {
                return {
                    onSnapshot: (cb) => {
                        const docs = [];
                        for (const [id, data] of membersStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        cb(docs);
                        return () => {};
                    }
                };
            }
            if (colName === 'notifications') {
                return {
                    where: (field, op, val) => ({
                        onSnapshot: (cb) => {
                            const docs = [];
                            for (const [id, data] of notifStore.entries()) {
                                if (data[field] === val) {
                                    docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                                }
                            }
                            cb(docs);
                            return () => {};
                        }
                    }),
                    doc: (notifId) => ({
                        set: async (data) => {
                            notifSets.push({ id: notifId, data });
                            notifStore.set(notifId, JSON.parse(JSON.stringify(data)));
                        },
                        update: async (data) => {
                            notifUpdates.push({ id: notifId, data });
                            const existing = notifStore.get(notifId) || {};
                            notifStore.set(notifId, { ...existing, ...data });
                        }
                    })
                };
            }
            return {
                doc: () => ({ get: async () => ({ exists: false }), set: async () => {}, update: async () => {} })
            };
        }
    };

    const elementMap = new Map();
    function createMockElement(tag = 'div', initialId = '') {
        let _id = initialId || '';
        const el = {
            tagName: tag.toUpperCase(),
            className: '',
            type: tag === 'input' ? 'text' : '',
            value: '',
            style: {},
            children: [],
            childNodes: [],
            parentNode: null,
            attributes: {},
            setAttribute(k, v) {
                this.attributes[k] = String(v);
                if (k === 'id') this.id = String(v);
                if (k === 'class') this.className = String(v);
            },
            getAttribute(k) { return this.attributes[k] ?? null; },
            removeAttribute(k) {
                delete this.attributes[k];
                if (k === 'id') this.id = '';
            },
            appendChild(child) {
                if (child.parentNode) child.parentNode.removeChild(child);
                child.parentNode = this;
                this.children.push(child);
                this.childNodes.push(child);
                return child;
            },
            removeChild(child) {
                const idx = this.children.indexOf(child);
                if (idx !== -1) this.children.splice(idx, 1);
                const cIdx = this.childNodes.indexOf(child);
                if (cIdx !== -1) this.childNodes.splice(cIdx, 1);
                child.parentNode = null;
                return child;
            },
            replaceChild(newChild, oldChild) {
                const idx = this.children.indexOf(oldChild);
                if (idx !== -1) {
                    this.children[idx] = newChild;
                    oldChild.parentNode = null;
                    newChild.parentNode = this;
                }
                const cIdx = this.childNodes.indexOf(oldChild);
                if (cIdx !== -1) {
                    this.childNodes[cIdx] = newChild;
                }
                return oldChild;
            },
            remove() {
                if (_id) elementMap.delete(_id);
                if (this.parentNode) this.parentNode.removeChild(this);
            },
            querySelector(selector) {
                const all = this.querySelectorAll(selector);
                return all.length ? all[0] : null;
            },
            querySelectorAll(selector) {
                const result = [];
                function traverse(node) {
                    for (const c of node.children) {
                        if (selector.startsWith('#') && c.id === selector.slice(1)) result.push(c);
                        else if (selector.startsWith('.') && (c.className || '').includes(selector.slice(1))) result.push(c);
                        else if (selector === '[data-onclick]' && (c.attributes['data-onclick'] || c.dataset?.onclick)) result.push(c);
                        else if (selector.startsWith('[')) {
                            const attrName = selector.replace(/[\[\]]/g, '').split('=')[0];
                            if (c.attributes[attrName] !== undefined) result.push(c);
                        }
                        traverse(c);
                    }
                }
                traverse(this);
                return result;
            },
            getBoundingClientRect() {
                return { top: 50, bottom: 88, left: 100, right: 138, width: 38, height: 38 };
            },
            contains(other) {
                let cur = other;
                while (cur) {
                    if (cur === this) return true;
                    cur = cur.parentNode;
                }
                return false;
            }
        };
        Object.defineProperty(el, 'id', {
            get() { return _id; },
            set(val) {
                if (_id) elementMap.delete(_id);
                _id = String(val || '');
                el.attributes['id'] = _id;
                if (_id) elementMap.set(_id, el);
            }
        });
        Object.defineProperty(el, 'innerHTML', {
            get() { return this._innerHTML || ''; },
            set(val) { this._innerHTML = val; }
        });
        Object.defineProperty(el, 'textContent', {
            get() { return this._textContent ?? this._innerHTML ?? ''; },
            set(val) { this._textContent = val; }
        });
        if (initialId) {
            el.id = initialId;
        }
        return el;
    }

    const docBody = createMockElement('body');
    const headerEl = createMockElement('header', 'app-header');
    const headerActions = createMockElement('div');
    headerActions.className = 'flex items-center gap-2';
    headerEl.appendChild(headerActions);
    docBody.appendChild(headerEl);

    const docHead = createMockElement('head');

    const documentMock = {
        body: docBody,
        head: docHead,
        documentElement: { clientWidth: 1200 },
        createElement: (tag) => createMockElement(tag),
        getElementById: (id) => elementMap.get(id) || null,
        querySelector: (sel) => {
            if (sel === '#app-header .flex.items-center.gap-2') return headerActions;
            if (sel.startsWith('#')) return elementMap.get(sel.slice(1)) || null;
            return null;
        },
        querySelectorAll: (sel) => docBody.querySelectorAll(sel),
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    let viewedDocId = null;

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        document: documentMock,
        location: { search: isGuest ? '?guest=1' : '' },
        GUEST_MODE: isGuest,
        COLLAB_MODE: isCollab,
        firebase: {
            firestore: () => firestoreMock,
            auth: () => ({ currentUser: authUser })
        },
        CollabStore: {
            getFirestoreDb: () => firestoreMock
        },
        CollabBootstrap: {
            getCurrentMember: () => currentMember
        },
        renderSelect: (id, options, selectedValue, cls) => {
            const optsStr = (options || []).map(o => `<option value="${o.value}">${o.label}</option>`).join('');
            return `<div class="custom-select ${cls || ''}" data-id="${id}" data-selected="${selectedValue}"><input type="hidden" id="${id}" value="${selectedValue}">${optsStr}</div>`;
        },
        viewDoc: (docId) => { viewedDocId = docId; },
        getViewedDocId: () => viewedDocId,
        notifSets,
        notifUpdates,
        notifStore,
        membersStore
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    const assignSource = read('js/collab-assign.js');
    vm.runInNewContext(assignSource, ctx);

    return ctx;
}

test('CollabAssign: getMemberLabel formats display names, emails, and fallbacks properly', () => {
    const ctx = createAssignContext();
    const { getMemberLabel } = ctx.CollabAssign;

    assert.equal(getMemberLabel(null), 'Unknown account');
    assert.equal(getMemberLabel({}), 'Unknown account');
    assert.equal(getMemberLabel({ displayName: 'Khanh Duy Nguyen', email: 'nguyenkhanhduy.sgd@gmail.com' }), 'Khanh Duy Nguyen (nguyenkhanhduy.sgd@gmail.com)');
    // If name is identical to email, do not duplicate
    assert.equal(getMemberLabel({ displayName: 'user@test.com', email: 'user@test.com' }), 'user@test.com');
    // If only email
    assert.equal(getMemberLabel({ email: 'Bob.Lead@example.com' }), 'Bob.Lead@example.com');
    // If only displayName
    assert.equal(getMemberLabel({ displayName: 'Charlie' }), 'Charlie');
});

test('CollabAssign: buildAssigneeOptions sorts members by email then uid and filters out non-team roles', () => {
    const ctx = createAssignContext({
        initialMembers: [
            ['u3', { uid: 'u3', displayName: 'Zack', email: 'zack@example.com', role: 'editor' }],
            ['u1', { uid: 'u1', displayName: 'Alex', email: 'alex@example.com', role: 'owner' }],
            ['u2', { uid: 'u2', displayName: 'Beth', email: 'alex@example.com', role: 'viewer' }],
            ['u-inv', { uid: 'u-inv', displayName: 'Pending', email: 'pending@example.com', role: 'invited' }]
        ]
    });
    ctx.CollabAssign.startListening();

    const { options } = ctx.CollabAssign.buildAssigneeOptions('', '', false);
    // Option 0 must be Unassigned
    assert.equal(options[0].value, '');
    assert.equal(options[0].label, 'Unassigned');

    // Filtered: u-inv (invited) must be excluded
    const values = options.map(o => o.value);
    assert.ok(!values.includes('u-inv'), 'invited role should be excluded');

    // u1 and u2 have same email 'alex@example.com', sorted by uid: u1 then u2, then u3
    assert.equal(options[1].value, 'u1');
    assert.equal(options[2].value, 'u2');
    assert.equal(options[3].value, 'u3');
});

test('CollabAssign: buildAssigneeOptions handles Batch edit modal with "— No change —"', () => {
    const ctx = createAssignContext();
    ctx.CollabAssign.startListening();

    const { options, selectedValue } = ctx.CollabAssign.buildAssigneeOptions('user-1', 'user-1', true);
    assert.equal(options[0].value, '');
    assert.equal(options[0].label, '— No change —');
    // Batch edit always leaves selectedValue empty so by default no change is applied
    assert.equal(selectedValue, '');
});

test('CollabAssign: buildAssigneeOptions preserves legacy free-text assignee values without overwriting', () => {
    const ctx = createAssignContext();
    ctx.CollabAssign.startListening();

    // Legacy assignee string "QA Lead", not matching any member uid
    const { options, selectedValue } = ctx.CollabAssign.buildAssigneeOptions('QA Lead', '', false);
    assert.equal(selectedValue, 'QA Lead');
    const legacyOpt = options.find(o => o.value === 'QA Lead');
    assert.ok(legacyOpt, 'Legacy option must be present in options list');
    assert.equal(legacyOpt.label, 'QA Lead');

    // Resolving legacy option returns the text label with empty uid
    const res = ctx.CollabAssign.resolveMember('QA Lead');
    assert.equal(res.label, 'QA Lead');
    assert.equal(res.uid, '');
    assert.equal(res.assignee, 'QA Lead');
    assert.equal(res.assigneeUid, '');
});

test('CollabAssign: resolveMember maps member uid to formatted label and uid, and handles Unassigned', () => {
    const ctx = createAssignContext();
    ctx.CollabAssign.startListening();

    // Member with name and email
    const res1 = ctx.CollabAssign.resolveMember('user-1');
    assert.equal(res1.uid, 'user-1');
    assert.equal(res1.label, 'Alice QA (alice@example.com)');
    assert.equal(res1.assignee, 'Alice QA (alice@example.com)');
    assert.equal(res1.assigneeUid, 'user-1');

    // Member with email only (casing preserved)
    const res2 = ctx.CollabAssign.resolveMember('user-2');
    assert.equal(res2.uid, 'user-2');
    assert.equal(res2.label, 'Bob.Lead@example.com');
    assert.equal(res2.assigneeUid, 'user-2');

    // Unassigned (empty string)
    const resEmpty = ctx.CollabAssign.resolveMember('');
    assert.equal(resEmpty.uid, '');
    assert.equal(resEmpty.label, '');
    assert.equal(resEmpty.assignee, '');
    assert.equal(resEmpty.assigneeUid, '');
});

test('CollabAssign: guest and personal modes do not replace inputs or render dropdowns', () => {
    // Guest mode
    const guestCtx = createAssignContext({ guest: true });
    assert.equal(guestCtx.CollabAssign.renderFocusOwnerField({ owner: 'Test' }), null);
    assert.equal(guestCtx.CollabAssign.renderBatchAssigneeField(), null);

    // Personal mode
    const personalCtx = createAssignContext({ collab: false });
    assert.equal(personalCtx.CollabAssign.renderFocusOwnerField({ owner: 'Test' }), null);
    assert.equal(personalCtx.CollabAssign.renderBatchAssigneeField(), null);
});

test('CollabAssign: notifyAssignment creates Firestore notification when assigned to teammate', async () => {
    const ctx = createAssignContext({
        authUser: { uid: 'user-current', displayName: 'Current User', email: 'current@example.com' }
    });
    ctx.CollabAssign.startListening();

    const doc = { id: 'doc-123', title: 'Critical Auth Flaw' };

    // 1. Assign to teammate (user-1)
    await ctx.CollabAssign.notifyAssignment({
        doc,
        kind: 'bug',
        signalKey: '',
        oldUid: '',
        newUid: 'user-1'
    });

    assert.equal(ctx.notifSets.length, 1);
    const notif = ctx.notifSets[0].data;
    assert.equal(notif.recipientUid, 'user-1');
    assert.equal(notif.actorUid, 'user-current');
    assert.equal(notif.actorName, 'Current User');
    assert.equal(notif.actorEmail, 'current@example.com');
    assert.equal(notif.docId, 'doc-123');
    assert.equal(notif.docTitle, 'Critical Auth Flaw');
    assert.equal(notif.kind, 'bug');
    assert.equal(notif.signalKey, '');
    assert.equal(typeof notif.createdAt, 'number');
    assert.equal(notif.readAt, null);
});

test('CollabAssign: notifyAssignment suppresses notifications for self, unassigned, and unchanged', async () => {
    const ctx = createAssignContext({
        authUser: { uid: 'user-current', displayName: 'Current User', email: 'current@example.com' },
        initialMembers: [
            ['user-current', { uid: 'user-current', displayName: 'Current User', email: 'current@example.com', role: 'editor' }],
            ['user-1', { uid: 'user-1', displayName: 'Alice QA', email: 'alice@example.com', role: 'editor' }]
        ]
    });
    ctx.CollabAssign.startListening();

    const doc = { id: 'doc-999', title: 'Regression Test' };

    // Self-assignment
    await ctx.CollabAssign.notifyAssignment({
        doc,
        kind: 'focus',
        signalKey: 'critical',
        oldUid: '',
        newUid: 'user-current'
    });
    assert.equal(ctx.notifSets.length, 0, 'Self-assignment must not create notification');

    // Unassigned (empty string)
    await ctx.CollabAssign.notifyAssignment({
        doc,
        kind: 'bug',
        oldUid: 'user-1',
        newUid: ''
    });
    assert.equal(ctx.notifSets.length, 0, 'Unassigning must not create notification');

    // Unchanged assignment
    await ctx.CollabAssign.notifyAssignment({
        doc,
        kind: 'bug',
        oldUid: 'user-1',
        newUid: 'user-1'
    });
    assert.equal(ctx.notifSets.length, 0, 'Unchanged assignee must not create notification');
});

test('CollabAssign: notifyBatchBugAssign generates notifications for batch assignments', async () => {
    const ctx = createAssignContext({
        authUser: { uid: 'user-current', displayName: 'Lead', email: 'lead@example.com' }
    });
    ctx.CollabAssign.startListening();

    await ctx.CollabAssign.notifyBatchBugAssign([
        { doc: { id: 'b1', title: 'Bug 1' }, oldUid: '', newUid: 'user-1' },
        { doc: { id: 'b2', title: 'Bug 2' }, oldUid: 'user-2', newUid: 'user-1' },
        { doc: { id: 'b3', title: 'Bug 3' }, oldUid: '', newUid: 'user-current' }, // self, ignored
        { doc: { id: 'b4', title: 'Bug 4' }, oldUid: 'user-1', newUid: 'user-1' } // unchanged, ignored
    ]);

    assert.equal(ctx.notifSets.length, 2, 'Should create exactly 2 notifications for distinct teammate assignments');
    assert.equal(ctx.notifSets[0].data.docId, 'b1');
    assert.equal(ctx.notifSets[1].data.docId, 'b2');
});

test('CollabAssign: notification bell in header attaches, updates badge, and renders panel', async () => {
    const ctx = createAssignContext({
        authUser: { uid: 'user-current', displayName: 'Current User', email: 'current@example.com' },
        initialNotifications: [
            ['n1', { id: 'n1', recipientUid: 'user-current', actorName: 'Alice QA', actorEmail: 'alice@example.com', docId: 'doc-1', docTitle: 'Bug One', kind: 'bug', createdAt: 1000, readAt: null }],
            ['n2', { id: 'n2', recipientUid: 'user-current', actorName: 'Bob Lead', actorEmail: 'bob@example.com', docId: 'doc-2', docTitle: 'Focus Two', kind: 'focus', createdAt: 2000, readAt: null }]
        ]
    });
    ctx.CollabAssign.startListening();

    // Bell attached to header
    ctx.CollabAssign.attachNotificationBell();
    const btn = ctx.document.getElementById('collab-notif-btn');
    assert.ok(btn, 'Bell button must exist in DOM');
    assert.equal(btn.getAttribute('aria-label'), 'Notifications');

    // Badge showing 2 unread
    const badge = btn.querySelector('.collab-notif-badge');
    assert.ok(badge, 'Badge element must exist');
    assert.equal(badge.textContent, '2');

    // Toggle open panel
    ctx.CollabAssign.toggleNotifications();
    const panel = ctx.document.getElementById('collab-notif-panel');
    assert.ok(panel, 'Panel must exist after toggling open');
    assert.ok(panel.innerHTML.includes('Alice QA (alice@example.com) assigned you Bug One'));
    assert.ok(panel.innerHTML.includes('Bob Lead (bob@example.com) assigned you Focus Two'));

    // Click first notification to open doc and mark as read
    await ctx.CollabAssign.openNotification('n1', 'doc-1');
    assert.equal(ctx.getViewedDocId(), 'doc-1');
    assert.equal(ctx.notifUpdates.length, 1);
    assert.equal(ctx.notifUpdates[0].id, 'n1');
    assert.equal(typeof ctx.notifUpdates[0].data.readAt, 'number');

    // Badge decremented to 1
    const updatedBadge = btn.querySelector('.collab-notif-badge');
    assert.ok(updatedBadge);
    assert.equal(updatedBadge.textContent, '1');
});

test('CollabAssign: badge formats 0 unread as hidden and >9 as 9+', () => {
    const ctx = createAssignContext();
    ctx.CollabAssign.attachNotificationBell();
    const btn = ctx.document.getElementById('collab-notif-btn');

    // 0 unread: badge removed
    ctx.CollabAssign.setNotifications([]);
    ctx.CollabAssign.updateNotificationBell();
    assert.equal(btn.querySelector('.collab-notif-badge'), null);

    // 12 unread: badge is '9+'
    const twelveNotifs = Array.from({ length: 12 }, (_, i) => ({
        id: `n-${i}`, recipientUid: 'user-current', readAt: null, createdAt: i
    }));
    ctx.CollabAssign.setNotifications(twelveNotifs);
    ctx.CollabAssign.updateNotificationBell();
    const badge = btn.querySelector('.collab-notif-badge');
    assert.ok(badge);
    assert.equal(badge.textContent, '9+');
});

test('CollabAssign: viewer role can interact with notification bell without restriction', () => {
    const viewerCtx = createAssignContext({ role: 'viewer' });
    const viewerSource = read('js/collab-viewer.js');
    vm.runInNewContext(viewerSource, viewerCtx);

    viewerCtx.CollabAssign.attachNotificationBell();
    const btn = viewerCtx.document.getElementById('collab-notif-btn');
    assert.ok(btn);

    // Run viewer restrictions
    viewerCtx.CollabViewer.applyViewerRestrictions();

    // Verify bell is NOT disabled
    assert.notEqual(btn.getAttribute('disabled'), '');
    assert.notEqual(btn.getAttribute('aria-disabled'), 'true');
    assert.equal(btn.disabled, undefined);
});
