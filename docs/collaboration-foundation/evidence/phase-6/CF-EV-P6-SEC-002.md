# CF-EV-P6-SEC-002 Provider isolation security review

Status: PASS

Story: `CF-P6-002`

The ADR-007 prohibition that no collaboration failure path may write to Personal Vault or personal GitHub is enforced structurally, not by convention. The collaboration provider is constructed without any reference to `DocStorage`, `GitHubSync`, or the personal vault, and a test asserts that neither its key names nor the source of any of its functions mentions them. A second test saves a personal document, invokes every deferred mutation until it throws, and asserts that the persisted personal payload and the pending-sync flag are byte-for-byte unchanged.

Context-change clearing is implemented and tested. `clearForContextChange()` drops unwrapped key material and plaintext view state, replaces the volatile containers rather than only emptying them, and marks the provider unusable. Every subsequent call — namespace derivation, outbox namespace derivation, context read, and key retention — fails with `PROVIDER_CONTEXT_CLEARED`, so stale authority from a previous logout, account switch, workspace switch, membership removal, device revocation, or key rotation cannot render into the next context. The module claims no JavaScript memory zeroization.

Unwrapped keys and decrypted view state are held only in volatile in-memory maps. Nothing in this story persists key material, plaintext, or draft context, and no secret, token, credential, or plaintext canary appears in the module, its tests, or this record.

Guest fixtures use neither provider, matching ADR-007. The module is lazy: it has no eager `<script>` tag in `index.html` and no service-worker precache entry, verified by test, so a Personal-only or Guest user loads zero Phase 6 collaboration bytes at startup.

Residual risk restated: the deferred document operations fail closed today, but the fail-closed guarantee for the real network paths must be re-proven when `CF-P6-004` through `CF-P6-006` implement them. This record does not extend to code that does not yet exist.
