import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function toPlain(value) {
    return JSON.parse(JSON.stringify(value));
}

export function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        clear() { values.clear(); },
        dump() { return Object.fromEntries(values); }
    };
}

export function loadState(options = {}) {
    const localStorage = createMemoryStorage(options.localStorage);
    const sessionStorage = createMemoryStorage(options.sessionStorage);
    const savedDocs = options.savedDocs || [];
    const saves = [];
    const calls = { getSettings: 0, getAll: 0, save: 0 };
    const DocStorage = {
        async getSettings() {
            calls.getSettings++;
            return {};
        },
        async getAll() {
            calls.getAll++;
            return savedDocs;
        },
        async save(docs) {
            calls.save++;
            saves.push(toPlain(docs));
            return true;
        }
    };
    const context = vm.createContext({
        console: options.console || console,
        localStorage,
        sessionStorage,
        DocStorage,
        GUEST_MODE: options.guest === true,
        SAMPLE_DOCS: options.sampleDocs || [],
        GUEST_DEMO_DOCS: options.guestDocs || []
    });
    const source = fs.readFileSync(path.join(root, 'js/state.js'), 'utf8') +
        '\n;globalThis.__stateTest = {' +
        'normalizeBugStatusValue, ensureBugStatusEvents, recordBugStatusChange,' +
        'normalizeReleasePolicy, evaluateReleaseReadiness, calculateReleaseQuality, getReleaseQuality,' +
        'normalizeFocusWorkflowEntry, getFocusWorkflowStatus, getFocusDueState, hydrate,' +
        'DocHistory, ActivityLog, getDocuments: () => documents' +
        '};';
    vm.runInContext(source, context, { filename: 'js/state.js' });
    return { api: context.__stateTest, localStorage, sessionStorage, DocStorage, calls, saves, savedDocs };
}

export function loadStorage(options = {}) {
    const localStorage = createMemoryStorage(options.localStorage);
    const sessionStorage = createMemoryStorage(options.sessionStorage);
    const context = vm.createContext({
        console: options.console || console,
        document: options.document,
        window: {},
        localStorage,
        sessionStorage,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        ArrayBuffer,
        crypto: globalThis.crypto,
        btoa: globalThis.btoa,
        atob: globalThis.atob,
        fetch: globalThis.fetch,
        setTimeout,
        clearTimeout,
        confirm: () => false
    });
    const source = fs.readFileSync(path.join(root, 'storage.js'), 'utf8') +
        '\n;globalThis.__storageTest = { DocStorage, GitHubSync, LocalAuth, Vault };';
    vm.runInContext(source, context, { filename: 'storage.js' });
    return { api: context.__storageTest, localStorage, sessionStorage };
}
