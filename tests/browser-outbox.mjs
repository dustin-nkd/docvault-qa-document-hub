// CF-P6-006 — the outbox against real IndexedDB in real browsers.
//
// The Node suite proves the state machine deterministically with an in-memory
// store. This proves the same module survives a real IndexedDB round trip,
// including that a Uint8Array payload comes back as bytes and that queued work
// outlives a page reload — which is the whole point of an offline outbox.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = 'js/collaboration/outbox.js';
const browsers = { chromium, firefox, webkit };
const required = (process.env.DOCVAULT_BROWSER_MATRIX || 'chromium,firefox,webkit').split(',');

function startServer() {
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        if (pathname === '/') {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<!doctype html><html><body><main>Outbox test origin</main></body></html>');
            return;
        }
        const candidate = path.resolve(root, pathname.replace(/^\/+/, ''));
        if (!candidate.startsWith(root + path.sep) || candidate !== path.join(root, ...modulePath.split('/'))) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        fs.createReadStream(candidate).pipe(response);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
        resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    }));
}

async function runBrowser(browserName, baseUrl) {
    const browser = await browsers[browserName].launch({ headless: true });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

        const first = await page.evaluate(async moduleUrl => {
            const {
                createIndexedDbOutboxStore, createOutbox, openOutboxDatabase
            } = await import(moduleUrl);

            const namespace = 'docvault:collab:local-browser-test:u1:w1:d1';
            const database = await openOutboxDatabase(indexedDB, 'docvault-outbox-test');
            const store = createIndexedDbOutboxStore(database);
            const outbox = createOutbox({ store, namespace, now: () => 1_900_000_000_000 });

            const id = '10000000-0000-4000-8000-000000000001';
            await outbox.enqueue({
                id,
                documentId: '20000000-0000-4000-8000-000000000001',
                clientMutationId: '30000000-0000-4000-8000-000000000001',
                operation: 'create',
                baseRevision: 0,
                keyVersion: 1,
                payload: new Uint8Array([1, 2, 3, 4, 5]),
                draft: new Uint8Array([9, 8, 7])
            });

            const claimed = await outbox.claimNext();
            const stats = await outbox.stats();
            return {
                claimedId: claimed.id,
                claimedState: claimed.state,
                mutationId: claimed.clientMutationId,
                payloadIsBytes: claimed.payload instanceof Uint8Array,
                payloadRoundTrip: Array.from(claimed.payload),
                pending: stats.pending
            };
        }, `${baseUrl}/${modulePath}`);

        assert.equal(first.claimedState, 'inflight', `${browserName}: claim must mark inflight`);
        assert.equal(first.payloadIsBytes, true, `${browserName}: payload must survive as bytes`);
        assert.deepEqual(first.payloadRoundTrip, [1, 2, 3, 4, 5], `${browserName}: payload bytes must be intact`);
        assert.equal(first.pending, 1, `${browserName}: the entry must still be pending`);

        // Reload: queued work must outlive the page, which is the point of the outbox.
        await page.reload({ waitUntil: 'domcontentloaded' });
        const second = await page.evaluate(async moduleUrl => {
            const {
                createIndexedDbOutboxStore, createOutbox, openOutboxDatabase
            } = await import(moduleUrl);
            const namespace = 'docvault:collab:local-browser-test:u1:w1:d1';
            const database = await openOutboxDatabase(indexedDB, 'docvault-outbox-test');
            const outbox = createOutbox({
                store: createIndexedDbOutboxStore(database), namespace,
                now: () => 1_900_000_000_000
            });

            const survived = (await outbox.list())[0];
            // A different context must not see this work.
            const otherContext = createOutbox({
                store: createIndexedDbOutboxStore(database),
                namespace: 'docvault:collab:local-browser-test:u2:w1:d1',
                now: () => 1_900_000_000_000
            });
            const otherVisible = (await otherContext.list()).length;
            const otherClaim = await otherContext.claimNext();

            await outbox.quarantine('device-revoked');
            const afterQuarantine = (await outbox.list())[0];
            const claimAfter = await outbox.claimNext();

            return {
                survivedId: survived.id,
                survivedPayload: Array.from(survived.payload),
                otherVisible,
                otherClaimed: otherClaim === null,
                quarantinedState: afterQuarantine.state,
                quarantineReason: afterQuarantine.quarantineReason,
                draftPreserved: afterQuarantine.draft instanceof Uint8Array,
                claimAfterQuarantine: claimAfter === null
            };
        }, `${baseUrl}/${modulePath}`);

        assert.equal(second.survivedId, first.claimedId, `${browserName}: the entry must survive a reload`);
        assert.deepEqual(second.survivedPayload, [1, 2, 3, 4, 5], `${browserName}: bytes must survive a reload`);
        assert.equal(second.otherVisible, 0, `${browserName}: another namespace must see nothing`);
        assert.equal(second.otherClaimed, true, `${browserName}: another namespace must claim nothing`);
        assert.equal(second.quarantinedState, 'quarantined', `${browserName}: quarantine must apply`);
        assert.equal(second.quarantineReason, 'device-revoked', `${browserName}: reason must be accurate`);
        assert.equal(second.draftPreserved, true, `${browserName}: quarantine must preserve the draft`);
        assert.equal(second.claimAfterQuarantine, true, `${browserName}: quarantined work must not execute`);

        assert.deepEqual(errors, [], `${browserName}: console and page errors must be empty`);
        return true;
    } finally {
        await browser.close();
    }
}

const { server, baseUrl } = await startServer();
try {
    for (const browserName of required) {
        if (!browsers[browserName]) throw new Error(`Unsupported browser: ${browserName}`);
        await runBrowser(browserName, baseUrl);
        console.log(`outbox IndexedDB lifecycle passed in ${browserName}`);
    }
} finally {
    server.close();
}
console.log('CF-P6-006 browser outbox evidence complete');
