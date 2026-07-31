import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const runtimeFiles = [
    'index.html',
    ...fs.readdirSync(path.join(root, 'js'))
        .filter(name => name.endsWith('.js'))
        .sort()
        .map(name => path.join('js', name))
];

test('runtime markup uses CSS hover states instead of delegated mouse handlers', () => {
    const source = runtimeFiles.map(read).join('\n');
    assert.equal((source.match(/data-onmouseenter=/g) || []).length, 0);
    assert.equal((source.match(/data-onmouseleave=/g) || []).length, 0);

    const events = read('js/events.js');
    assert.doesNotMatch(events, /addEventListener\(['"]mouseover['"]/);
    assert.doesNotMatch(events, /addEventListener\(['"]mouseout['"]/);

    const css = read('style.css');
    for (const className of ['ui-hover-card', 'ui-hover-card-h', 'ui-hover-bg2', 'ui-hover-danger', 'ui-hover-text', 'ui-hover-accent']) {
        assert.match(css, new RegExp('\\.' + className.replace(/-/g, '\\-') + ':hover'));
    }
});

test('runtime markup contains no native inline click handlers', () => {
    for (const relativePath of runtimeFiles) {
        const source = read(relativePath);
        const matches = [...source.matchAll(/(?:^|\s)onclick=/gm)];
        assert.equal(matches.length, 0, relativePath + ' still contains native onclick handlers');
    }
});

test('user-controlled editor actions use the shared safe action serializer', () => {
    const editor = [read('js/render-editor-categories.js'), read('js/render-editor.js')].join('\\n');
    assert.match(editor, /actionAttr\('selectSubfolder', f\)/);
    assert.match(editor, /actionAttr\('selectCustomOption', id, o\.value, o\.label, onChangeCode\)/);
    assert.doesNotMatch(editor, /selectSubfolder\('\$\{escHtml/);
    assert.doesNotMatch(editor, /selectCustomOption\('\$\{id\}/);
});

test('service worker version is bumped for the strict CSP shell change', () => {
    assert.match(read('sw.js'), /const SW_VERSION = 'v51'/);
    assert.match(read('sw.js'), /'\.\/js\/workspaces\.js'/, 'the workspace module must be cached in the app shell');
});

// Extracts a `function <name>(key) { ... }` declaration and returns it as a
// callable, running against a stubbed localStorage. Tests the code as shipped
// rather than a copy of it.
const loadKeyMapper = (relativePath, name, store) => {
    const source = read(relativePath).replace(/\r\n/g, '\n');
    const match = source.match(new RegExp('function ' + name + '\\(key\\) \\{[\\s\\S]*?\\n\\}'));
    assert.ok(match, name + '() must be defined in ' + relativePath);
    const factory = new Function('localStorage', match[0] + '; return ' + name + ';');
    return { fn: factory({ getItem: k => (k in store ? store[k] : null) }), source: match[0] };
};

test('the default workspace keeps using the storage it already has', () => {
    // The whole migration story rests on this: an existing vault must resolve to
    // byte-identical localStorage keys and GitHub paths after this feature ships.
    // If wsKey ever rewrites the default workspace, every user loses their data.
    const store = {};
    const { fn: wsKey } = loadKeyMapper('storage.js', 'wsKey', store);
    for (const key of ['docvault_docs', 'docvault_deleted_ids', 'github_shard_sha_3', 'docvault_activity_log']) {
        assert.equal(wsKey(key), key, 'unset workspace must not rewrite ' + key);
        store.docvault_active_workspace = 'default';
        assert.equal(wsKey(key), key, 'the default workspace must not rewrite ' + key);
        delete store.docvault_active_workspace;
    }

    store.docvault_active_workspace = 'trulioo';
    assert.equal(wsKey('docvault_docs'), 'ws_trulioo__docvault_docs');
    assert.equal(wsKey('github_shard_sha_3'), 'ws_trulioo__github_shard_sha_3');

    // A malformed id must fall back to the default namespace, never escape it —
    // the id also becomes part of a GitHub path.
    for (const bad of ['../../etc', 'a/b', 'Trulioo', '-lead', 'x'.repeat(40), '']) {
        store.docvault_active_workspace = bad;
        assert.equal(wsKey('docvault_docs'), 'docvault_docs', 'rejected id "' + bad + '" must fall back to the default key');
    }
});

test('every copy of the workspace key mapper stays identical', () => {
    // The mapper is duplicated across files on purpose (assets ship with
    // max-age=600, so a fresh file can load beside a stale one and a cross-file
    // call would silently read another workspace's data). Duplication is only
    // safe while the copies agree — one drifting copy corrupts data.
    const store = {};
    const canonical = loadKeyMapper('storage.js', 'wsKey', store);
    const copies = ['js/state.js', 'js/actions-focus.js', 'js/actions-sharing.js']
        .map(relativePath => ({ relativePath, ...loadKeyMapper(relativePath, '_wsKey', store) }));

    const canonicalBody = canonical.source.replace('function wsKey(', 'function _wsKey(');
    for (const copy of copies) {
        assert.equal(copy.source, canonicalBody, copy.relativePath + ' has drifted from wsKey() in storage.js');
        for (const id of ['default', 'trulioo', '../escape', '']) {
            store.docvault_active_workspace = id;
            assert.equal(copy.fn('docvault_docs'), canonical.fn('docvault_docs'));
        }
    }
});

test('every workspace-scoped storage key and vault path is namespaced', () => {
    // Sync bookkeeping is the dangerous one: a shard sha shared between two
    // workspaces would let a push for one overwrite the other's shard.
    const storage = read('storage.js');
    for (const [property, key] of [
        ['SHA_KEY', 'github_data_sha'], ['SHARD_SHA_PREFIX', 'github_shard_sha_'],
        ['SHARD_FP_PREFIX', 'github_shard_fp_'], ['META_SHA_KEY', 'github_meta_sha'],
        ['META_FP_KEY', 'github_meta_fp'], ['STORAGE_KEY', 'docvault_docs'],
        ['DELETED_IDS_KEY', 'docvault_deleted_ids'], ['PENDING_SYNC_KEY', 'docvault_sync_pending']
    ]) {
        assert.match(storage, new RegExp('get ' + property + "\\(\\) \\{ return wsKey\\('" + key + "'\\); \\}"),
            property + ' must resolve through wsKey()');
    }
    for (const property of ['SHARDS_DIR', 'META_PATH']) {
        assert.match(storage, new RegExp('get ' + property + '\\(\\) \\{ return wsPath\\('), property + ' must resolve through wsPath()');
    }
    // Shared by every workspace — namespacing these would strand the vault.
    assert.match(storage, /SETTINGS_KEY: 'github_settings'/);
    assert.match(storage, /HASH_KEY: 'docvault_master_hash'/);
    assert.match(storage, /SALT_KEY: 'docvault_kdf_salt_v2'/);
    // One password unlocks every workspace, so a change must re-encrypt them all.
    assert.match(storage, /for \(const workspaceId of workspaceIds\(\)\)/);
});

test('switching workspace cannot let the previous vault write into the next one', () => {
    // A queued GitHub push resolves its paths and shas lazily. If it lands after
    // the active workspace id has moved, it writes the old workspace's documents
    // over the new one's shards — silent, unrecoverable data loss.
    const source = read('js/workspaces.js');
    const body = source.slice(source.indexOf('window.switchWorkspace'));
    const flushAt = body.indexOf('_flushActiveWorkspaceSync()');
    const writeAt = body.indexOf("localStorage.setItem('docvault_active_workspace'");
    assert.ok(flushAt > -1 && writeAt > -1, 'switchWorkspace must flush the sync queue and set the active workspace');
    assert.ok(flushAt < writeAt, 'the pending sync must be flushed BEFORE the active workspace changes');
    assert.match(body, /await DocStorage\._syncInFlight/, 'an in-flight push must be awaited, not just the queue');
    // Remote-format detection is cached per vault and must not carry over.
    assert.match(body, /GitHubSync\._remoteSharded = false/);
    // Unsaved editor state must not be discarded silently by a switch.
    assert.match(body, /_captureEditorFormState\(\) !== state\._editorSnapshot/);
});

test('sharing helpers stay in the same file as their caller', () => {
    // Assets ship with max-age=600, so a browser can pair a stale index.html with
    // a fresh script. Any helper shareDoc() calls unguarded must therefore be
    // defined alongside it, or that pairing throws "<helper> is not defined".
    const sharing = read('js/actions-sharing.js');
    for (const helper of ['_encryptSharePayload', '_buildSharePayload', '_stripEnvSecrets', '_pushShareSnapshot', '_getShares', '_saveShares', '_recordShare']) {
        assert.match(sharing, new RegExp('(?:async )?function ' + helper + '\\s*\\('),
            helper + ' must be defined in js/actions-sharing.js, not a separate file');
    }
    // persist() reaches across files, so it must stay defensively guarded.
    assert.match(read('js/state.js'), /typeof syncActiveShares === 'function'/);
});

test('every delete path revokes the share links publishing the document', () => {
    // A share link left behind after a delete keeps serving the deleted content
    // to anyone holding it, and lingers in Shared Links needing a manual revoke.
    const ui = read('js/ui.js');
    for (const fn of ['confirmDelete', 'hardDeleteDoc', 'emptyTrash']) {
        const body = ui.slice(ui.indexOf('function ' + fn));
        const end = body.indexOf('\n}');
        assert.match(body.slice(0, end), /_revokeSharesForDeleted\(/,
            fn + '() must revoke share links for the documents it deletes');
    }
    assert.match(read('js/actions-batch-history.js'), /_revokeSharesForDeleted\(ids\)/);
    // Revocation reaches across files, so it must never be able to block a delete.
    assert.match(ui, /typeof revokeSharesForDocs !== 'function'/);
    assert.match(read('js/actions-batch-history.js'), /typeof _revokeSharesForDeleted === 'function'/);
});

test('the activity timeline is a real list with full-row targets', () => {
    // The old rows were <div>s whose only hit target was the few characters of
    // the document title, wired up with a click handler on a <span>.
    const source = read('js/render-core.js');
    const row = source.slice(source.indexOf('function _renderActivityRow'));
    const end = row.indexOf('\nfunction renderActivityLog');
    const body = row.slice(0, end);
    assert.match(body, /<li class="act-row">/, 'each entry must be a list item');
    assert.match(body, /<button class="act-item" data-onclick="viewDoc\(/, 'the whole row must be the target');
    assert.doesNotMatch(body, /<span[^>]*data-onclick="viewDoc\(/, 'navigation must not hang off a span');
    assert.match(source, /timeline \+= `<div class="act-day">/, 'entries must be grouped by day');
    // Relative-only timestamps hid the exact time; keep the machine-readable one.
    assert.match(body, /<time class="act-time" datetime="\$\{date\.toISOString\(\)\}" title=/);
    assert.match(read('style.css'), /\.act-time\s*\{[^}]*font-variant-numeric:tabular-nums/,
        'the time column must use tabular figures so it aligns');
    // A full log is ActivityLog.MAX rows; keep off-screen rows out of layout.
    assert.match(read('style.css'), /\.act-row\s*\{[^}]*content-visibility:auto/);
});

test('clearing the activity log asks before wiping it', () => {
    // Clearing is unrecoverable and used to happen on a single click.
    const source = read('js/render-core.js');
    assert.match(source, /data-onclick="confirmClearActivityLog\(\)"/, 'the Clear button must go through the confirmation');
    const confirm = source.slice(source.indexOf('window.confirmClearActivityLog'));
    assert.match(confirm.slice(0, confirm.indexOf('\nwindow.clearActivityLog')), /data-onclick="clearActivityLog\(\)"/);
});

test('relative timestamps use singular forms', () => {
    // fmtDate printed "1 days ago" for every one-day-old document.
    const utils = read('js/utils.js');
    for (const [plural, singular] of [['minsAgo', 'minAgo'], ['hoursAgo', 'hourAgo'], ['daysAgo', 'dayAgo']]) {
        assert.match(utils, new RegExp("=== 1 \\? '" + singular + "' : '" + plural + "'"), plural + ' needs a singular branch');
    }
    const strings = read('js/constants.js');
    for (const key of ['minAgo', 'hourAgo', 'dayAgo']) {
        assert.match(strings, new RegExp('\\b' + key + ':\\s*"1 '), key + ' must be defined');
    }
});

test('toasts are anchored below the header instead of on top of it', () => {
    // At a fixed top-4 the first toast sat over the header's own controls and
    // swallowed their clicks. The header height varies (71px desktop, up to 89px
    // on a mobile editor), so the offset has to follow the real element.
    const html = read('index.html');
    assert.doesNotMatch(html, /id="toasts"[^>]*\btop-\d/, '#toasts must not hardcode a top offset');
    assert.match(html, /#toasts\s*\{[^}]*top:\s*calc\(var\(--header-h/,
        '#toasts must be offset by the tracked header height');
    assert.match(read('js/ui.js'), /setProperty\('--header-h'/,
        'js/ui.js must keep --header-h in sync with the real header');
});

test('the runtime ships a single dark theme with no light-theme leftovers', () => {
    // A half-removed theme is what made the markdown viewer crash: a container
    // hardcoded to one theme while the runtime was told to use another. Keep the
    // theme surface at exactly one value so that mismatch cannot reappear.
    for (const relativePath of [...runtimeFiles, 'style.css']) {
        const source = read(relativePath);
        assert.doesNotMatch(source, /\[data-theme=["']light["']\]/,
            relativePath + ' still carries light-theme styling');
        assert.doesNotMatch(source, /toggleTheme|initTheme/,
            relativePath + ' still references the removed theme toggle');
        // The stored preference may only be cleaned up, never read or written.
        assert.doesNotMatch(source, /(?:get|set)Item\(\s*['"]qahub_theme['"]/,
            relativePath + ' still reads or writes the removed theme preference');
    }
    assert.match(read('index.html'), /<html[^>]+data-theme="dark"/);
    // Toast UI throws on a non-'light' falsy theme, so it must be passed a literal.
    assert.doesNotMatch(read('js/render-core.js'), /theme:\s*(?:undefined|null)/);
});

test('deployment blocks on the locked browser regression suite', () => {
    assert.ok(fs.existsSync(path.join(root, 'package-lock.json')));
    const workflow = read('.github/workflows/deploy.yml');
    assert.match(workflow, /run: npm ci/);
    assert.match(workflow, /run: npx playwright install --with-deps chromium/);
    assert.match(workflow, /run: npm run test:e2e/);
    assert.ok(workflow.indexOf('npm run test:e2e') < workflow.indexOf('peaceiris\/actions-gh-pages'));
});
