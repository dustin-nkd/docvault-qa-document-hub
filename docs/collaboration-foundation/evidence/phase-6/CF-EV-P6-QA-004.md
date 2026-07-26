# CF-EV-P6-QA-004 Preview integration quality reconciliation

Status: PASS

Story: `CF-P6-008`

The Preview document slice is deployed, reachable, correctly gated, and exercised end to end against Preview deployment `25a4a7d8`. **All six sprint gate scenarios are verified over Preview HTTP**, and all six are independently verified against the same real D1 schema at the persistence layer.

Verified earlier over HTTP: G1 by the zero-line Personal Vault diff, G4 by two concurrent writers returning 409 and 200 with the loser writing nothing, G5 by a retry returning the original revision with no fourth revision created, and the reconcile half of G6 by the mutation route reporting state applied.

## Second identity

G2 and G3 were previously blocked because membership role is per user per workspace and only one GitHub identity could authenticate. The cause is now known and was never a defect: `guardedProvider` in `functions/_lib/identity/runtime-handler.ts` rejects any resolved identity whose numeric subject is absent from the `PREVIEW_ALLOWED_GITHUB_SUBJECTS` allowlist. That is a deliberate Preview control — only designated identities may authenticate there — and the second account had simply never been designated. The owner added its subject and redeployed, because Cloudflare Pages binds environment variables at build time.

Both identities are real GitHub accounts belonging to the project owner. **No synthetic identity was used and no test or authentication bypass was deployed.**

Diagnosing that block also surfaced a genuine defect, fixed separately: every identity-validation and transport failure in the GitHub OAuth adapter collapsed into the default `unavailable` category, which made an account-data rejection indistinguishable from a provider outage.

## G2 — an Editor creates, a Viewer reads

On workspace `81987e05`, the owner sealed a document with a genuine 32-byte workspace DEK under `A256GCM-doc-v1`. The Viewer, holding only an envelope wrapped to its own device public key, listed the workspace, read the document, enumerated its two revisions, unwrapped the workspace key, and decrypted the exact plaintext the Editor had sealed. The server never held plaintext, a device private key, or the DEK.

## G3 — a Viewer cannot write

The same Viewer attempted `document-create`, `document-update`, and `document-tombstone`. All three were denied with the single shared non-disclosing code `RESOURCE_NOT_FOUND`, which does not reveal whether the resource exists. The document's revision count was 2 before the attempts and 2 after: **zero rows were written**. The denial lives in the SQL guard, so each attempt rolled back rather than being decided at the route.

## Cleanup

Cleanup was carried out through the product API and is reported exactly: the qualification document was tombstoned, all three devices were revoked, and both API sessions were logged out. Zero active documents and zero active devices remain.

Residual Preview state is retained and disclosed rather than forced to zero. Seven document revisions and the audit events are append-only by trigger and cannot be deleted by design; two workspaces remain because the Preview surface exposes no workspace delete route; and three browser sessions from the identity runs remain live because their tokens were never captured and could not be revoked without them. No shared Preview restore was performed and no direct D1 write was made.
