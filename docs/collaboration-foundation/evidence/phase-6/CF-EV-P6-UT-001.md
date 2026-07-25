# CF-EV-P6-UT-001 StorageProvider abstraction unit evidence

Status: PASS

Story: `CF-P6-002`

`js/collaboration/storage-provider.js` implements the ADR-007 provider boundary: `PERSONAL_VAULT_PROVIDER` and `COLLABORATION_PROVIDER` identities, `createPersonalVaultProvider`, `createCollaborationProvider`, `collaborationNamespace`, `createProviderRegistry`, and `guestUsesProvider`. Sixteen Node tests in `tests/storage-provider-isolation.test.mjs` cover the surface.

Namespace derivation binds environment, immutable subject, workspace, device, and optional document into a single key. A test enumerates one base namespace and five single-component variants and asserts six distinct results, so preview, production, local test, another subject, another workspace, and another device can never collide in browser storage. Every component is mandatory: an unsupported environment, an empty subject, or a non-UUID workspace, device, or document identifier fails closed with a distinct error code rather than degrading to a partial key.

Provider selection has no default and no fallback. `select(undefined)`, `select('')`, and an unregistered-but-valid identifier each throw, so a caller that fails to choose a provider cannot silently land on Personal Vault. Duplicate registration is rejected.

The eight deferred document operations — list, read, create, update, tombstone, list revisions, read revision, and reconcile mutation — each throw a distinct `NOT_IMPLEMENTED_*` code. The code is deliberately distinct from an authorization denial so a caller can never mistake "not built yet" for "the server said no" and fall back to a personal write. They are implemented by `CF-P6-004` through `CF-P6-006`.

The collaboration provider's frozen surface is asserted to contain no personal, DocStorage, GitHub, or vault reference in any key name or function source, so the isolation is structural rather than conventional.
