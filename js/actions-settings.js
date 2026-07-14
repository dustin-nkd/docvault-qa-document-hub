// ========================
// GITHUB SETTINGS MODAL
// ========================
// Settings tab content builders (Sprint 14). Presentation-only split of what
// used to be four stacked sections in one long scrolling modal — every
// form id and data-onclick handler below is unchanged from before, so none
// of changeMasterPassword/savePasswordHint/generateRecoveryKey/
// saveGitHubSettings/toggleImageCdn/compactImages/cleanupUnusedImages/
// exportBackup/triggerImportBackup needed to change.
function _settingsTabAccount() {
    return `
        <form onsubmit="event.preventDefault(); changeMasterPassword();" class="flex flex-col gap-3 text-left">
            <div>
                <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">Current Password</label>
                <input type="password" id="mp-current" class="form-input w-full py-1.5 px-3 text-xs" placeholder="••••••••">
            </div>
            <div>
                <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">New Password</label>
                <input type="password" id="mp-new" class="form-input w-full py-1.5 px-3 text-xs" placeholder="••••••••">
            </div>
            <div>
                <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">Confirm New Password</label>
                <input type="password" id="mp-confirm" class="form-input w-full py-1.5 px-3 text-xs" placeholder="••••••••">
            </div>
            <button type="submit" class="btn-p py-1.5 px-4 text-xs w-full flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-key text-[10px]"></i> Change Master Password
            </button>
        </form>`;
}

function _settingsTabSecurity() {
    const currentHint = window.LocalAuth ? window.LocalAuth.getHint() : '';
    const hasRecovery = !!localStorage.getItem(window.LocalAuth ? window.LocalAuth.RECOVERY_KEY : 'docvault_recovery_blob');
    const hintSyncOn = !!(window.LocalAuth && window.LocalAuth.isHintSyncEnabled && window.LocalAuth.isHintSyncEnabled());
    return `
        <div class="text-left">
            <div class="mb-4">
                <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m);">Password Hint <span class="font-normal" style="color:var(--tx-d);">(stored unencrypted)</span></label>
                <div class="flex gap-2">
                    <input type="text" id="sec-hint" class="form-input flex-1 py-1.5 px-3 text-xs" placeholder="e.g. Pet name + year" maxlength="80" value="${escHtml(currentHint)}">
                    <button type="button" class="btn-s py-1.5 px-3 text-xs whitespace-nowrap" data-onclick="savePasswordHint()">Save</button>
                </div>
                <label class="flex items-center gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" id="sec-hint-sync" class="form-checkbox" ${hintSyncOn ? 'checked' : ''}>
                    <span class="text-[10px]" style="color:var(--tx-d);">Sync hint across devices <strong style="color:#f59e0b;">(readable publicly on GitHub)</strong></span>
                </label>
                <p class="text-[10px] mt-1" style="color:var(--tx-d);">Shown on lock screen as a reminder. Never include your actual password. Kept on this device only unless you enable sync above.</p>
            </div>
            <div>
                <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m);">Recovery Key</label>
                <p class="text-[11px] mb-2" style="color:${hasRecovery ? 'var(--acc)' : '#f59e0b'};">
                    <i class="fa-solid fa-${hasRecovery ? 'circle-check' : 'triangle-exclamation'} mr-1"></i>${hasRecovery ? 'Recovery key is active.' : 'No key set — forgotten password means lost data.'}
                </p>
                <button type="button" id="sec-gen-recovery-btn" class="btn-s py-1.5 px-4 text-xs flex items-center gap-1.5" data-onclick="generateRecoveryKey()">
                    <i class="fa-solid fa-key text-[10px]"></i> ${hasRecovery ? 'Regenerate Key' : 'Generate Recovery Key'}
                </button>
                <p class="text-[10px] mt-1.5" style="color:var(--tx-d);">20-character code that can unlock your vault if you forget your password. Store it offline.</p>
            </div>
        </div>`;
}

function _settingsTabSync() {
    const ghSettings = (window._settingsModalData && window._settingsModalData.ghSettings) || { token: '' };
    const imgCdnOn = localStorage.getItem('docvault_img_cdn') === '1';
    return `
        <div class="text-left">
            <div class="bg-[var(--bg)] border border-[var(--brd)] rounded-lg px-3 py-2 mb-3 text-[11px]" style="color:var(--tx-d)">
                <i class="fa-solid fa-circle-info mr-1 text-[var(--acc)]"></i>
                Syncing to <strong style="color:var(--tx)">dustin-nkd/docvault-assets</strong>. Only the token is needed — repo is fixed.
            </div>
            <button type="button" class="btn-s py-1.5 px-3 text-xs w-full mb-3 flex items-center justify-center gap-1.5" data-onclick="closeModal();showShareManager()"><i class="fa-solid fa-share-nodes text-[10px]"></i> Manage Shared Links (${_getShares().length})</button>
            <form onsubmit="event.preventDefault(); saveGitHubSettings();" class="flex flex-col gap-3">
                <div>
                    <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">Personal Access Token (PAT)</label>
                    <input type="password" id="gh-token" class="form-input w-full py-1.5 px-3 text-xs" placeholder="github_pat_..." value="${escHtml(ghSettings.token || '')}">
                    <p class="text-[10px] mt-1" style="color:var(--tx-d)">Token requires <strong>Contents: Read & Write</strong> permission on the repo.</p>
                </div>
                <label class="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id="gh-img-cdn" class="form-checkbox mt-0.5" ${imgCdnOn ? 'checked' : ''} data-onchange="toggleImageCdn(this)">
                    <span class="text-[10px]" style="color:var(--tx-d);">Store pasted images on GitHub CDN <strong style="color:#f59e0b;">(public, unencrypted)</strong> instead of inline. Shrinks the vault; images become publicly readable. Off by default.</span>
                </label>
                <button type="button" class="btn-s py-1.5 px-3 text-xs w-full flex items-center justify-center gap-1.5" data-onclick="closeModal();compactImages()"><i class="fa-solid fa-compress text-[10px]"></i> Compact existing inline images → CDN</button>
                <button type="button" class="btn-s py-1.5 px-3 text-xs w-full flex items-center justify-center gap-1.5 mt-2" data-onclick="closeModal();cleanupUnusedImages()"><i class="fa-solid fa-broom text-[10px]"></i> Clean up unused CDN images</button>
                <div class="pt-3 mt-2 border-t border-[var(--brd)] flex justify-end">
                    <button type="submit" class="btn-p py-1.5 px-4 text-xs flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-save text-[10px]"></i> Save Token
                    </button>
                </div>
            </form>
        </div>`;
}

function _settingsTabBackup() {
    const unlocked = !!(window.LocalAuth && window.LocalAuth.isUnlocked && window.LocalAuth.isUnlocked());
    return `
        <div class="text-left">
            <p class="text-[11px] mb-3" style="color:var(--tx-d);">Download a local JSON copy of all documents, or restore from one. ${unlocked ? '<strong style="color:#f59e0b;">The export includes decrypted credential passwords in plain text</strong> — store it as carefully as the vault itself.' : ''}</p>
            <div class="flex gap-2">
                <button type="button" class="btn-s py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1.5" data-onclick="exportBackup()"><i class="fa-solid fa-download text-[10px]"></i> Export Backup</button>
                <button type="button" class="btn-s py-1.5 px-3 text-xs flex-1 flex items-center justify-center gap-1.5" data-onclick="triggerImportBackup()"><i class="fa-solid fa-upload text-[10px]"></i> Import Backup</button>
            </div>
        </div>`;
}

// Tags tab (Sprint 18, 18-1). Tag identity is addressed by INDEX into a
// stashed window array rather than embedded raw text in data-onclick, since
// tag names are free user text and could contain quotes/commas that the
// CSP action-string dispatcher isn't meant to round-trip reliably.
function _settingsTabTags() {
    const counts = {};
    documents.forEach(d => {
        if (d.status === 'deleted') return;
        (d.tags || []).forEach(tg => { counts[tg] = (counts[tg] || 0) + 1; });
    });
    const tags = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    window._tagManagerList = tags;
    if (!tags.length) {
        return `<p class="text-xs text-center py-6" style="color:var(--tx-d);">No tags yet.</p>`;
    }
    return `
        <div class="text-left">
            <p class="text-[11px] mb-3" style="color:var(--tx-d);">Rename a tag to merge it into another (e.g. rename "payment" to "Payment" to combine them). Applies to every document that has it.</p>
            <div class="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
                ${tags.map((tg, i) => `
                    <div class="flex items-center gap-1.5 p-2 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                        <span class="text-[10px] shrink-0 w-12 text-right" style="color:var(--tx-d);">${counts[tg]} doc${counts[tg] !== 1 ? 's' : ''}</span>
                        <input type="text" id="tag-rename-${i}" class="form-input flex-1 py-1 px-2 text-xs" value="${escHtml(tg)}">
                        <button type="button" class="btn-s text-[10px] py-1 px-2 shrink-0" data-onclick="_applyTagRename(${i})">Rename</button>
                        <button type="button" class="btn-d text-[10px] py-1 px-2 shrink-0" data-onclick="_confirmDeleteTag(${i})" title="Remove tag"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

window._applyTagRename = async function(idx) {
    const oldName = window._tagManagerList && window._tagManagerList[idx];
    const input = document.getElementById(`tag-rename-${idx}`);
    const newName = input?.value.trim();
    if (!oldName || !newName || newName === oldName) return;
    let changed = 0;
    documents.forEach(d => {
        if (!Array.isArray(d.tags) || !d.tags.includes(oldName)) return;
        d.tags = [...new Set(d.tags.map(tg => tg === oldName ? newName : tg))]; // dedup = merge
        d.updatedAt = Date.now();
        changed++;
    });
    await persist();
    toast(`Renamed "${oldName}" → "${newName}" on ${changed} document${changed !== 1 ? 's' : ''}.`, 'success');
    const body = document.getElementById('settings-modal-body');
    if (body) body.innerHTML = _settingsTabTags();
};

window._confirmDeleteTag = function(idx) {
    const tagName = window._tagManagerList && window._tagManagerList[idx];
    if (!tagName) return;
    window._pendingTagDeleteIdx = idx;
    showModal(`
        <div class="text-center">
            <i class="fa-solid fa-trash text-2xl mb-3" style="color:#f87171;"></i>
            <h3 class="font-heading font-bold text-lg mb-2">Remove tag "${escHtml(tagName)}"?</h3>
            <p class="text-sm mb-5" style="color:var(--tx-m);">Removes this tag from every document that has it. The documents themselves aren't otherwise affected.</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                <button class="btn-d" data-onclick="_doDeleteTag()">Remove</button>
            </div>
        </div>`);
};

window._doDeleteTag = async function() {
    closeModal();
    const idx = window._pendingTagDeleteIdx;
    window._pendingTagDeleteIdx = null;
    const tagName = window._tagManagerList && window._tagManagerList[idx];
    if (!tagName) return;
    let changed = 0;
    documents.forEach(d => {
        if (!Array.isArray(d.tags) || !d.tags.includes(tagName)) return;
        d.tags = d.tags.filter(tg => tg !== tagName);
        d.updatedAt = Date.now();
        changed++;
    });
    await persist();
    toast(`Removed tag "${tagName}" from ${changed} document${changed !== 1 ? 's' : ''}.`, 'success');
    const body = document.getElementById('settings-modal-body');
    if (body) body.innerHTML = _settingsTabTags();
};

const SETTINGS_TABS = [
    { id: 'account', label: 'Account', icon: 'fa-lock', render: _settingsTabAccount },
    { id: 'security', label: 'Security', icon: 'fa-shield-halved', render: _settingsTabSecurity },
    { id: 'sync', label: 'Sync', icon: 'fa-rotate', render: _settingsTabSync },
    { id: 'tags', label: 'Tags', icon: 'fa-tags', render: _settingsTabTags },
    { id: 'backup', label: 'Backup', icon: 'fa-box-archive', render: _settingsTabBackup }
];

function _renderSettingsModal() {
    const activeTab = window._settingsTab || 'account';
    return `
        <div>
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-heading font-bold text-lg flex items-center gap-2" style="color:var(--tx);"><i class="fa-solid fa-sliders text-[var(--acc)]"></i> DocVault Settings</h3>
                <button type="button" class="text-base leading-none" style="color:var(--tx-d);" data-onclick="closeModal()" title="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="flex gap-1 mb-5 p-1 rounded-lg" style="background:var(--bg);border:1px solid var(--brd);">
                ${SETTINGS_TABS.map(tb => `
                    <button type="button" class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors" style="${activeTab === tb.id ? 'background:var(--acc);color:#fff;' : 'color:var(--tx-m);'}" data-onclick="_switchSettingsTab('${tb.id}')">
                        <i class="fa-solid ${tb.icon}" style="font-size:10px;"></i> ${tb.label}
                    </button>
                `).join('')}
            </div>
            <div id="settings-modal-body">${(SETTINGS_TABS.find(tb => tb.id === activeTab) || SETTINGS_TABS[0]).render()}</div>
        </div>`;
}

window._switchSettingsTab = function(tab) {
    window._settingsTab = tab;
    const body = document.getElementById('settings-modal-body');
    const tabDef = SETTINGS_TABS.find(tb => tb.id === tab);
    if (!body || !tabDef) return;
    body.innerHTML = tabDef.render();
    // Update tab pill active styles in place (avoids re-animating the whole modal).
    document.querySelectorAll('#modal [data-onclick^="_switchSettingsTab"]').forEach(btn => {
        const isActive = btn.getAttribute('data-onclick') === `_switchSettingsTab('${tab}')`;
        btn.style.background = isActive ? 'var(--acc)' : 'transparent';
        btn.style.color = isActive ? '#fff' : 'var(--tx-m)';
    });
};

window.showGitHubSettingsModal = async function() {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        toast('Settings are disabled in demo mode.', 'info');
        return;
    }
    let ghSettings = { owner: '', repo: '', branch: 'main', token: '' };
    const storedGh = await GitHubSync.getSettings();
    if (storedGh) {
        ghSettings = { ...ghSettings, ...storedGh };
    }
    window._settingsModalData = { ghSettings };
    window._settingsTab = window._settingsTab || 'account';
    showModal(_renderSettingsModal());
};

window.toggleImageCdn = function(el) {
    const on = !!(el && el.checked);
    if (on) localStorage.setItem('docvault_img_cdn', '1');
    else localStorage.removeItem('docvault_img_cdn');
    toast(on ? 'New images will be stored on the public GitHub CDN.' : 'New images will be stored inline (encrypted).', 'info');
};

// Manual test trigger for the sharded-sync migration (Sprint 23). NOT wired
// into any UI button — call from the console/preview_eval only. Additive:
// writes new shard files + a meta file to the configured GitHub repo, never
// touches or deletes the existing single-file vault. Safe to call multiple
// times (idempotent). Prints a byte-level comparison report so migration
// correctness can be confirmed against real data before anything switches
// over to reading/writing shards by default.
window.testShardedSync = async function() {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        console.warn('[testShardedSync] Not available in guest demo mode (no real GitHub vault to test against).');
        return;
    }
    if (!(await GitHubSync.isConfigured())) {
        console.warn('[testShardedSync] GitHub sync is not configured — nothing to migrate.');
        return;
    }
    console.log('[testShardedSync] Migrating to sharded storage (additive — legacy file untouched)...');
    const migrateResult = await GitHubSync.migrateToSharded();
    console.log('[testShardedSync] Migration wrote shards for', migrateResult.migratedDocCount, 'docs.');

    console.log('[testShardedSync] Verifying: re-reading legacy file + shards and comparing...');
    const report = await GitHubSync.verifyShardedMigration();
    if (report.ok) {
        console.log(`[testShardedSync] ✅ VERIFIED — ${report.legacyCount} docs match exactly between legacy file and shards.`);
    } else {
        console.error('[testShardedSync] ❌ MISMATCH —', report);
    }
    return report;
};

window.saveGitHubSettings = async function() {
    const token = document.getElementById('gh-token').value.trim();
    const d = GitHubSync.DEFAULTS;
    if (token) {
        await GitHubSync.saveSettings({ ...d, token });
        toast(t('ghSaveSuccess'), "success");
        closeModal();
    } else {
        GitHubSync.clearSettings();
        toast(t('ghCleared'), "info");
        closeModal();
    }
};

window.changeMasterPassword = async function() {
    const current = document.getElementById('mp-current').value;
    const newPwd = document.getElementById('mp-new').value;
    const confirmPwd = document.getElementById('mp-confirm').value;

    if (!current || !newPwd || !confirmPwd) {
        toast(t('mpFillAll'), "warning");
        return;
    }
    if (newPwd !== confirmPwd) {
        toast(t('mpMismatch'), "error");
        return;
    }
    if (newPwd.length < (window.LocalAuth.MIN_PASSWORD_LENGTH || 8)) {
        toast(t('mpTooShort'), "warning");
        return;
    }

    try {
        await window.LocalAuth.changePassword(current, newPwd);
        // Sync the re-encrypted vault (and the now-revoked recovery blob, rb:null) to
        // GitHub immediately. Otherwise other devices still need the OLD password until
        // the next document save, and the stale recovery blob lingers remotely.
        if (await window.GitHubSync.isConfigured()) {
            try {
                await window.DocStorage.queueSync(documents, { securityMeta: window.GitHubSync._getLocalSecurityMeta() }, { failurePrefix: 'Password changed locally, but GitHub sync failed' });
            } catch (e) {
                toast('Password changed locally, but GitHub sync failed: ' + e.message, "error");
            }
        }
        toast(t('mpChanged'), "success");
        toast('Recovery key was revoked — generate a new one in the Security section.', "info");
        if (window.updateLockSecurityState) window.updateLockSecurityState();
        document.getElementById('mp-current').value = '';
        document.getElementById('mp-new').value = '';
        document.getElementById('mp-confirm').value = '';
    } catch (e) {
        toast(e.message || t('mpChangeFail'), "error");
    }
};

window.savePasswordHint = async function() {
    const input = document.getElementById('sec-hint');
    if (!input) return;
    const text = input.value.trim();
    const syncCb = document.getElementById('sec-hint-sync');
    const syncOn = !!(syncCb && syncCb.checked);
    window.LocalAuth.setHint(text);
    window.LocalAuth.setHintSync(syncOn);
    if (window.updateLockSecurityState) window.updateLockSecurityState();
    // Push either way: when sync is off this clears the public copy from GitHub
    // (the meta builder sends an empty hint), when on it publishes the new hint.
    if (await window.GitHubSync.isConfigured()) {
        window.DocStorage.queueSync(
            documents,
            { securityMeta: window.GitHubSync._getLocalSecurityMeta() },
            { failurePrefix: 'Password hint saved locally, but sync failed' }
        );
    }
    toast(!text ? 'Password hint cleared.' : (syncOn ? 'Password hint saved & synced (public).' : 'Password hint saved on this device only.'), 'success');
};

window.generateRecoveryKey = async function() {
    const pwd = sessionStorage.getItem(window.LocalAuth.SESSION_PWD);
    if (!pwd) { toast('Vault must be unlocked to generate a recovery key.', 'warning'); return; }
    const btn = document.getElementById('sec-gen-recovery-btn');
    setButtonBusy(btn, true, 'Generating key...');
    try {
        const code = await window.LocalAuth.generateRecovery(pwd);
        // Push immediately so the blob is available cross-device without waiting for the next doc save
        if (await window.GitHubSync.isConfigured()) {
            window.DocStorage.queueSync(documents, { securityMeta: window.GitHubSync._getLocalSecurityMeta() }, { silent: true });
        }
        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4" style="background:rgba(16,185,129,0.15);">
                    <i class="fa-solid fa-key text-xl" style="color:var(--acc);"></i>
                </div>
                <h3 class="font-bold text-base mb-1" style="color:var(--tx);">Recovery Key Generated</h3>
                <p class="text-xs mb-5" style="color:var(--tx-m);">Save this key somewhere safe. You will <strong>not</strong> see it again.</p>
                <div class="rounded-xl px-4 py-4 mb-4 cursor-pointer select-all" style="background:var(--bg);border:2px solid var(--acc);font-family:monospace;font-size:17px;font-weight:700;letter-spacing:0.14em;color:var(--acc);" title="Click to select all">${escHtml(code)}</div>
                <div class="rounded-lg px-3 py-2 mb-5 text-left text-[11px]" style="background:var(--card);border:1px solid var(--brd);">
                    <i class="fa-solid fa-triangle-exclamation text-amber-400 mr-1"></i>
                    <strong style="color:var(--tx-m);">Store this offline</strong><span style="color:var(--tx-d);"> — in a password manager, printed paper, or secure notes app. This is the only copy.</span>
                </div>
                <button class="btn-p py-2 px-6 text-sm w-full" data-onclick="closeModal()">I've saved it — Close</button>
            </div>
        `);
    } catch(e) {
        toast(e.message || 'Failed to generate recovery key.', 'error');
    } finally {
        setButtonBusy(btn, false);
    }
};

window.recoverVault = async function() {
    const input = document.getElementById('recovery-code-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) { toast('Enter your recovery code.', 'warning'); return; }
    const btn = document.getElementById('recover-submit-btn');
    setButtonBusy(btn, true, 'Recovering vault...');
    try {
        const password = await window.LocalAuth.recoverWithCode(code);
        // Guard against a stale recovery blob (e.g. one generated before the master
        // password was changed): the recovered password must match the CURRENT vault
        // hash, otherwise unlocking would decrypt nothing and look like data loss.
        const storedHash = localStorage.getItem(window.LocalAuth.HASH_KEY);
        if (storedHash) {
            const recoveredHash = await window.LocalAuth._hash(password);
            if (recoveredHash !== storedHash) {
                throw new Error('This recovery key is outdated — the master password was changed after it was created. Use the current password, or reset the vault.');
            }
        }
        sessionStorage.setItem(window.LocalAuth.SESSION_KEY, '1');
        sessionStorage.setItem(window.LocalAuth.SESSION_PWD, password);
        document.getElementById('lock-screen').classList.add('hidden');
        if (window.resetLockFormState) window.resetLockFormState();
        toast('Vault recovered! Consider changing your password in Settings.', 'success');
        if (window._afterUnlock) window._afterUnlock();
    } catch(e) {
        toast(e.message || 'Recovery failed.', 'error');
    } finally {
        setButtonBusy(btn, false);
    }
};
