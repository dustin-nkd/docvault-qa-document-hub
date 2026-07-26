# CF-EV-P6-QA-004 Preview integration quality reconciliation

Status: PARTIAL

Story: `CF-P6-008`

The Preview document slice is deployed, reachable, correctly gated, and exercised end to end with a real session. Four of the six sprint gate scenarios are verified over Preview HTTP and all six are verified against the same real D1 schema at the persistence layer.

Verified over HTTP: G1 by the zero-line Personal Vault diff, G4 by two concurrent writers returning 409 and 200 with the loser writing nothing, G5 by a retry returning the original revision with no fourth revision created, and the reconcile half of G6 by the mutation route reporting state applied.

Not verified over HTTP: G2 and G3. Both require a second GitHub identity because role is per user per workspace. Three authentication attempts for a second account failed at the OAuth callback with the deliberately non-disclosing auth-result of unavailable; D1 shows the transactions were created but never consumed and the rate limiter stayed well below its ceiling. The failure is outside the Phase 6 code under test — the same callback succeeded for the first identity on this deployment.

This record is PARTIAL rather than PASS, and CF-P6-008 does not exit at P6-G4A on the strength of it. The Phase 6 exit report carries the gap forward explicitly rather than absorbing it.

Cleanup was partial and is recorded as such: the test document was tombstoned through the product API and one session was logged out through the API, but a device revoke returned 400 on a malformed body after the session had closed, and direct D1 writes were refused by the permission classifier. One owner browser session, one active device, and one workspace holding only a tombstoned document remain, with append-only revision history retained by design.
