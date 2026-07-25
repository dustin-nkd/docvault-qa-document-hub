# CF-EV-P6-QA-001 Personal Vault unchanged characterization

Status: PASS

Story: `CF-P6-002`

Sprint gate scenario **G1 (Personal documents unchanged)** is satisfied by the strongest available evidence: `storage.js` has a zero-line diff for this story. The abstraction wraps the shipped `DocStorage` by delegation instead of moving or rewriting it, so there is no refactor for Personal Vault behaviour to drift through.

A characterization baseline was captured **before** the abstraction was written, as the sprint requires, and is committed as `tests/personal-vault-characterization.test.mjs`. Ten tests pin the observable Personal Vault contract: the three storage key strings (`docvault_docs`, `docvault_deleted_ids`, `docvault_sync_pending`), the exact eleven-method public surface, the `null`-not-empty-array return of `getAll()` on an empty vault, byte-for-byte document round-tripping through local storage, the absence of any network call and of a pending-sync flag when GitHub is unconfigured, pending-sync persistence and exact clearing, deleted-id accumulation without dropping earlier tombstones, credential password round-tripping while unlocked, the absence of any plaintext credential password in persisted storage, and the zeroed `getUsage()` shape.

All ten passed against the unmodified code before the provider module existed and all ten pass after it. The suite is registered in `tests/run.mjs` and therefore runs in the authoritative `npm run check` gate on every future change, so a later story that disturbs Personal Vault fails the gate rather than shipping.

The personal provider is additionally proven to delegate faithfully: reads through the provider and reads directly through `DocStorage` return equal documents, and constructing the provider without real storage fails closed.

Scope note: call-site migration is deliberately not part of this story. Application code still calls `DocStorage` directly; the provider boundary is exercised by tests. Rewiring call sites lands with the collaboration document experience in `CF-P6-007`, and this record does not claim it was done.
