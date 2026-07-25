// CF-P6-007 — conflict resolution and Copy to workspace in real browsers.
//
// The Node and Workers suites prove the logic and the resulting revisions. This
// proves the same module loads and behaves identically in Chromium, Firefox, and
// WebKit, and that every user-facing status carries a text label and a shape so
// meaning never depends on colour.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = 'js/collaboration/conflict-resolution.js';
const browsers = { chromium, firefox, webkit };
const required = (process.env.DOCVAULT_BROWSER_MATRIX || 'chromium,firefox,webkit').split(',');

function startServer() {
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        if (pathname === '/') {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<!doctype html><html><body><main>Conflict test origin</main></body></html>');
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

        const result = await page.evaluate(async moduleUrl => {
            const {
                RESOLUTION_OPTIONS, RESOLUTION_STATUS, assessCopyEligibility,
                openConflict, prepareWorkspaceCopy, resolveConflict
            } = await import(moduleUrl);

            const DOC = '11111111-1111-4111-8111-111111111111';
            const NEW_DOC = '22222222-2222-4222-8222-222222222222';
            const WORKSPACE = '33333333-3333-4333-8333-333333333333';
            const MUTATION = '55555555-5555-4555-8555-555555555555';
            const conflict = () => openConflict({
                conflictId: '44444444-4444-4444-8444-444444444444',
                documentId: DOC, submittedBaseRevision: 4, currentRevision: 5,
                draft: new Uint8Array([1, 2, 3]), now: 1_900_000_000_000
            });

            // Every option is reachable from a freshly opened conflict.
            const reachable = RESOLUTION_OPTIONS.map(option => {
                try {
                    const resolved = resolveConflict(conflict(), option, {
                        confirmed: true, newDocumentId: NEW_DOC, clientMutationId: MUTATION
                    });
                    return { option, ok: true, draftRetained: resolved.draftRetained };
                } catch (error) {
                    return { option, ok: false, code: error.code };
                }
            });

            // Discard without confirmation must refuse.
            let discardWithoutConfirmation = null;
            try {
                resolveConflict(conflict(), 'discard-with-confirmation');
            } catch (error) { discardWithoutConfirmation = error.code; }

            // Status descriptors must never rely on colour alone.
            const statuses = Object.entries(RESOLUTION_STATUS).map(([state, status]) => ({
                state, hasLabel: status.label.length > 0, hasShape: status.shape.length > 0
            }));

            const credential = assessCopyEligibility({ id: DOC, category: 'credential' });
            let credentialPrepared = null;
            try {
                prepareWorkspaceCopy({
                    source: { id: DOC, category: 'credential' },
                    destinationWorkspaceId: WORKSPACE, destinationRole: 'editor', keyReady: true,
                    newDocumentId: NEW_DOC, clientMutationId: MUTATION, confirmedClassification: true
                });
            } catch (error) { credentialPrepared = error.code; }

            const copy = prepareWorkspaceCopy({
                source: { id: DOC, category: 'testcase' },
                destinationWorkspaceId: WORKSPACE, destinationRole: 'editor', keyReady: true,
                newDocumentId: NEW_DOC, clientMutationId: MUTATION, confirmedClassification: true
            });

            return {
                reachable, discardWithoutConfirmation, statuses,
                credentialSelectable: credential.selectable,
                credentialPrepared,
                copySourceMutated: copy.sourceMutated,
                copyLinked: copy.linked,
                copyRevision: copy.expectedRevision
            };
        }, `${baseUrl}/${modulePath}`);

        for (const entry of result.reachable) {
            assert.equal(entry.ok, true, `${browserName}: ${entry.option} was not reachable (${entry.code})`);
        }
        const losing = result.reachable.filter(entry => entry.draftRetained === false);
        assert.deepEqual(losing.map(entry => entry.option), ['discard-with-confirmation'],
            `${browserName}: only a confirmed discard may drop the draft`);
        assert.equal(result.discardWithoutConfirmation, 'CONFIRMATION_REQUIRED',
            `${browserName}: discard must require confirmation`);

        for (const status of result.statuses) {
            assert.equal(status.hasLabel, true, `${browserName}: ${status.state} lacks a text label`);
            assert.equal(status.hasShape, true, `${browserName}: ${status.state} lacks a shape token`);
        }

        assert.equal(result.credentialSelectable, false, `${browserName}: a Credential must not be selectable`);
        assert.equal(result.credentialPrepared, 'CREDENTIAL_NOT_COPYABLE',
            `${browserName}: a Credential must be refused before destination encryption`);
        assert.equal(result.copySourceMutated, false, `${browserName}: a copy must not mutate its source`);
        assert.equal(result.copyLinked, false, `${browserName}: a copy must be unlinked`);
        assert.equal(result.copyRevision, 1, `${browserName}: a copy must land at revision 1`);

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
        console.log(`conflict resolution and copy passed in ${browserName}`);
    }
} finally {
    server.close();
}
console.log('CF-P6-007 browser conflict and copy evidence complete');
