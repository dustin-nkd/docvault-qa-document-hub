# CF-EV-P6-E2E-003 Preview document journey over real HTTP

Status: PARTIAL — four of six sprint gate scenarios verified over Preview HTTP

Story: `CF-P6-008`

An authenticated journey ran against the isolated Preview alias on 2026-07-26 using a real OAuth session, a real registered device, a real workspace bootstrapped with a genuine 32-byte DEK wrapped through P-256 ECDH, HKDF-SHA-256, and AES-256-GCM, and real document envelopes sealed by the production `js/collaboration/document-envelope.js` module. No test bypass was deployed and no secret was read.

**Verified over Preview HTTP.** Document create returned `201` at revision 1 and the document read back at revision 1. Two concurrent `PUT` requests against base revision 1 returned `409` and `200` — exactly one advanced the document — and D1 confirms the loser wrote nothing. A retry carrying the same `Idempotency-Key` returned the original revision 3 with `replayed: true`, and D1 confirms no fourth revision was created. The mutation reconcile route returned `state: applied` for that mutation identifier, which is the route that lets a client resolve a lost response. Revision history returned three entries in order, and after a tombstone the document reported `state: tombstoned` at revision 4 while historical revision 2 remained readable. Final D1 state is one document, four revisions in the order `create, update, update, delete`, and zero active documents.

That covers sprint gate **G4** (two writers, one base revision), **G5** (retry creates no duplicate revision), and the reconcile half of **G6**, with **G1** already established by the zero-line Personal Vault diff.

**Not verified over Preview HTTP: G2 and G3.** Both require a second GitHub identity — an Editor and a Viewer must be different users, because membership role is per user per workspace. Three attempts to authenticate a second account failed at the OAuth callback with the deliberately non-disclosing `auth-result=unavailable`, and D1 confirms the transactions were created but never consumed while the rate limiter stayed well below its ceiling. Only one user, `dustin-nkd`, exists in the Preview database. Rather than retry indefinitely, this is recorded as outstanding.

G2 and G3 are already proven against the same real D1 schema at the persistence layer by `CF-EV-P6-INT-001` and `CF-EV-P6-INT-002`, where a Viewer reads a document an Editor created and a Viewer create, update, and tombstone are each denied with zero document, revision, ledger, and audit rows. What remains unproven is the same role behaviour exercised through the HTTP layer.

**Identity provenance, stated accurately.** The session used was the project owner's personal GitHub account `dustin-nkd`, not a designated synthetic identity as the operational runbook prescribes. The owner was advised of this twice before proceeding and chose to continue. This record does not describe the identity as synthetic.
