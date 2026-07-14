import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage, toPlain } from './harness.mjs';

const LEGACY_SALT = new TextEncoder().encode('docvault-kdf-v1');

function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

async function legacyEncrypt(data, password, ivSeed = 1) {
    const material = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: LEGACY_SALT, iterations: 100000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );
    const iv = Uint8Array.from({ length: 12 }, (_, index) => (ivSeed + index) & 0xff);
    const plain = new TextEncoder().encode(JSON.stringify(data));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    const payload = new Uint8Array(iv.length + cipher.length);
    payload.set(iv);
    payload.set(cipher, iv.length);
    return `ENC:${bytesToBase64(payload)}`;
}

function tamper(ciphertext) {
    const [prefix, encoded] = ciphertext.split(':');
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;
    return `${prefix}:${bytesToBase64(bytes)}`;
}

function setIterations(ciphertext, iterations) {
    const [prefix, encoded] = ciphertext.split(':');
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    new DataView(bytes.buffer).setUint32(0, iterations, false);
    return `${prefix}:${bytesToBase64(bytes)}`;
}

test('Vault keeps fixed V1 ciphertext readable while identifying it as legacy', async () => {
    const { api } = loadStorage();
    const fixture = { docs: [{ id: 'legacy', title: 'Existing vault' }], cfg: { branch: 'main' } };
    const ciphertext = await legacyEncrypt(fixture, 'correct horse battery staple');

    assert.equal(api.Vault.isEncrypted(ciphertext), true);
    assert.equal(api.Vault.getVersion(ciphertext), 1);
    assert.deepEqual(toPlain(await api.Vault.decrypt(ciphertext, 'correct horse battery staple')), fixture);
});

test('Vault V2 uses 600k PBKDF2, a stable random vault salt, and a fresh IV', async () => {
    const { api } = loadStorage();
    const value = { secret: 'not plaintext', nested: [1, 2, 3] };
    const first = await api.Vault.encrypt(value, 'strong master password');
    const second = await api.Vault.encrypt(value, 'strong master password');
    const firstInfo = api.Vault.getInfo(first);
    const secondInfo = api.Vault.getInfo(second);

    assert.match(first, /^DV2:/);
    assert.equal(api.Vault.getVersion(first), 2);
    assert.equal(firstInfo.iterations, 600000);
    assert.equal(firstInfo.salt, secondInfo.salt);
    assert.notEqual(firstInfo.iv, secondInfo.iv);
    assert.notEqual(first, second);
    assert.equal(first.includes('not plaintext'), false);
    assert.deepEqual(toPlain(await api.Vault.decrypt(first, 'strong master password')), value);
});

test('Vault V2 rejects wrong passwords, tampering, malformed envelopes, and excessive KDF work', async () => {
    const { api } = loadStorage();
    const ciphertext = await api.Vault.encrypt({ protected: true }, 'strong master password');

    await assert.rejects(api.Vault.decrypt(ciphertext, 'wrong master password'));
    await assert.rejects(api.Vault.decrypt(tamper(ciphertext), 'strong master password'));
    await assert.rejects(api.Vault.decrypt('DV2:not-base64!', 'strong master password'));
    assert.throws(() => api.Vault.getInfo('DV2:AAAAAA=='));
    assert.throws(() => api.Vault.getInfo(setIterations(ciphertext, 2000001)), /work factor/);
});

test('verified migration upgrades V1 to V2 without changing the decrypted value', async () => {
    const { api } = loadStorage();
    const value = { docs: [{ id: 'migrate-me', password: 'still protected' }] };
    const legacy = await legacyEncrypt(value, 'migration password', 21);
    const result = await api.Vault.migrate(legacy, 'migration password');

    assert.equal(result.migrated, true);
    assert.equal(result.version, 2);
    assert.match(result.ciphertext, /^DV2:/);
    assert.deepEqual(toPlain(result.data), value);
    assert.deepEqual(toPlain(await api.Vault.decrypt(result.ciphertext, 'migration password')), value);
});

test('local documents and GitHub settings migrate atomically after a successful V1 read', async () => {
    const password = 'migration password';
    const docs = [{ id: 'doc-1', category: 'knowledge', title: 'Legacy document' }];
    const settings = { owner: 'owner', repo: 'vault', branch: 'main', token: 'token' };
    const legacyDocs = await legacyEncrypt(docs, password, 31);
    const legacySettings = await legacyEncrypt(settings, password, 41);
    const { api, localStorage } = loadStorage({
        localStorage: { docvault_docs: legacyDocs, github_settings: legacySettings },
        sessionStorage: { docvault_pwd: password }
    });

    assert.deepEqual(toPlain(await api.DocStorage._getLocal()), docs);
    assert.equal(api.Vault.getVersion(localStorage.getItem('docvault_docs')), 2);
    assert.deepEqual(toPlain(await api.GitHubSync.getSettings()), settings);
    assert.equal(api.Vault.getVersion(localStorage.getItem('github_settings')), 2);
});

test('recovery succeeds with a V1 blob and upgrades it for the next recovery', async () => {
    const code = 'ABCDEFGHIJKLMNOPQRST';
    const legacy = await legacyEncrypt({ pwd: 'current master password' }, code, 51);
    const { api, localStorage } = loadStorage({ localStorage: { docvault_recovery_blob: legacy } });

    assert.equal(await api.LocalAuth.recoverWithCode(code), 'current master password');
    assert.equal(api.Vault.getVersion(localStorage.getItem('docvault_recovery_blob')), 2);
});

test('local migration re-encrypts nested credential secrets instead of preserving V1 blobs', async () => {
    const password = 'credential migration password';
    const credentialPassword = await legacyEncrypt('api-secret', password, 61);
    const docs = [{ id: 'cred-1', category: 'credential', title: 'API', password: credentialPassword }];
    const legacyDocs = await legacyEncrypt(docs, password, 71);
    const { api, localStorage } = loadStorage({
        localStorage: { docvault_docs: legacyDocs },
        sessionStorage: { docvault_pwd: password }
    });

    const loaded = await api.DocStorage._getLocal();
    assert.equal(loaded[0].password, 'api-secret');
    const stored = localStorage.getItem('docvault_docs');
    assert.equal(api.Vault.getVersion(stored), 2);
    const encryptedDocs = await api.Vault.decrypt(stored, password);
    assert.equal(api.Vault.getVersion(encryptedDocs[0].password), 2);
    assert.equal(await api.Vault.decrypt(encryptedDocs[0].password, password), 'api-secret');
});

test('an encryption failure never falls back to plaintext local persistence', async () => {
    const quietConsole = { ...console, error() {} };
    const { api, localStorage } = loadStorage({ sessionStorage: { docvault_pwd: 'active password' }, console: quietConsole });
    api.Vault.encrypt = async () => { throw new Error('simulated crypto failure'); };

    assert.equal(await api.DocStorage._saveLocal([{ id: 'secret', password: 'plaintext' }]), false);
    assert.equal(localStorage.getItem('docvault_docs'), null);
});

test('password change prepares verified V2 replacements and rekeys nested credentials', async () => {
    const oldPassword = 'old master password';
    const newPassword = 'new master password';
    const nested = await legacyEncrypt('credential-secret', oldPassword, 81);
    const docs = [{ id: 'cred', category: 'credential', password: nested }];
    const settings = { owner: 'owner', repo: 'repo', token: 'github-token' };
    const rawDocs = await legacyEncrypt(docs, oldPassword, 91);
    const rawSettings = await legacyEncrypt(settings, oldPassword, 101);
    const recovery = await legacyEncrypt({ pwd: oldPassword }, 'ABCDEFGHIJKLMNOPQRST', 111);
    const { api, localStorage, sessionStorage } = loadStorage({
        localStorage: {
            docvault_docs: rawDocs,
            github_settings: rawSettings,
            docvault_recovery_blob: recovery
        },
        sessionStorage: { docvault_pwd: oldPassword }
    });

    await api.LocalAuth.changePassword(oldPassword, newPassword);

    const migratedDocsRaw = localStorage.getItem('docvault_docs');
    const migratedSettingsRaw = localStorage.getItem('github_settings');
    assert.equal(api.Vault.getVersion(migratedDocsRaw), 2);
    assert.equal(api.Vault.getVersion(migratedSettingsRaw), 2);
    const migratedDocs = await api.Vault.decrypt(migratedDocsRaw, newPassword);
    assert.equal(api.Vault.getVersion(migratedDocs[0].password), 2);
    assert.equal(await api.Vault.decrypt(migratedDocs[0].password, newPassword), 'credential-secret');
    assert.deepEqual(toPlain(await api.Vault.decrypt(migratedSettingsRaw, newPassword)), settings);
    await assert.rejects(api.Vault.decrypt(migratedDocsRaw, oldPassword));
    assert.equal(sessionStorage.getItem('docvault_pwd'), newPassword);
    assert.equal(localStorage.getItem('docvault_recovery_blob'), null);
    const verifier = localStorage.getItem('docvault_master_hash');
    assert.equal(api.Vault.getVersion(verifier), 2);
    assert.equal(await api.LocalAuth.verifyPassword(newPassword, verifier), true);
    assert.equal(await api.LocalAuth.verifyPassword(oldPassword, verifier), false);
});

test('unlock accepts the legacy SHA-256 verifier once and replaces it with Vault V2', async () => {
    const lockScreen = { classList: { add() {} } };
    const document = { getElementById(id) { return id === 'lock-screen' ? lockScreen : null; } };
    const { api, localStorage, sessionStorage } = loadStorage({ document });
    const password = 'legacy verifier password';
    localStorage.setItem('docvault_master_hash', await api.LocalAuth._hash(password));

    await api.LocalAuth.unlock(password);

    const verifier = localStorage.getItem('docvault_master_hash');
    assert.equal(api.Vault.getVersion(verifier), 2);
    assert.equal(await api.LocalAuth.verifyPassword(password, verifier), true);
    assert.equal(sessionStorage.getItem('docvault_unlocked'), '1');
});

test('password change rolls back earlier replacements when a later storage write fails', async () => {
    const oldPassword = 'old rollback password';
    const newPassword = 'new rollback password';
    const rawDocs = await legacyEncrypt([{ id: 'doc' }], oldPassword, 121);
    const rawSettings = await legacyEncrypt({ token: 'token' }, oldPassword, 131);
    const recovery = 'existing-recovery';
    const quietConsole = { ...console, error() {} };
    const { api, localStorage, sessionStorage } = loadStorage({
        console: quietConsole,
        localStorage: {
            docvault_docs: rawDocs,
            github_settings: rawSettings,
            docvault_recovery_blob: recovery
        },
        sessionStorage: { docvault_pwd: oldPassword }
    });
    localStorage.setItem('docvault_master_hash', await api.LocalAuth._hash(oldPassword));
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let failed = false;
    localStorage.setItem = (key, value) => {
        if (!failed && key === 'github_settings' && value !== rawSettings) {
            failed = true;
            throw new Error('simulated settings write failure');
        }
        originalSetItem(key, value);
    };

    await assert.rejects(api.LocalAuth.changePassword(oldPassword, newPassword), /simulated settings write failure/);

    assert.equal(localStorage.getItem('docvault_docs'), rawDocs);
    assert.equal(localStorage.getItem('github_settings'), rawSettings);
    assert.equal(localStorage.getItem('docvault_recovery_blob'), recovery);
    assert.equal(sessionStorage.getItem('docvault_pwd'), oldPassword);
});
