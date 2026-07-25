# CF-EV-P6-STA-001 Document and sync contract freeze

Status: PASS

Story: `CF-P6-001`

The Phase 6 shared-document contract is reconciled across ADR-003/004/005/006/007/010/011/012, the API and schema contracts, the crypto contract, the quality strategy, the threat and risk registers, and the Phase 5 exit and Phase 6 handoff. The canonical profile is [`phase-6-document-contract-freeze.md`](../../phase-6-document-contract-freeze.md), backed by `config/cloudflare/phase-6-contract-freeze.json`.

Two findings changed the plan rather than being assumed. First, schema 12 is sufficient and no migration is required or authorized: a read-only query of the live isolated Preview D1 confirmed `documents.workspace_id`/`current_revision`/`current_key_version`, the append-only `PRIMARY KEY (document_id, revision)` with `CHECK (base_revision = revision - 1)`, the create precondition check, the revision-level idempotency uniqueness on `(workspace_id, actor_user_id, actor_device_id, client_mutation_id)`, and the `mutation_results` ledger with its own uniqueness constraint and 32-byte request fingerprint. Second, the route surface is eight, not the seven listed in the first draft of the sprint plan: `GET /api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}` was omitted, and without it a client that lost a mutation response cannot learn whether the mutation applied, leaving ADR-006 reconciliation and sprint gate scenarios G5 and G6 unverifiable. The sprint plan, manifest, and policy were corrected to eight before this freeze.

Frozen in this story: the eight-route surface with zero Viewer mutation routes, the mutation envelope and its prohibition on client-supplied actor/role/revision/time, the ten ordered canonical fingerprint inputs, the seven-step atomic processing order, the error taxonomy, the outbox state machine with its quarantine and expiry rules, the four conflict resolution options with no automatic merge, copy eligibility including client-side-only Credential rejection, the two immutable vector sets with an independent-oracle requirement, the supported browser profiles, and the sprint evidence identifiers.

No migration, route, source module, binding, secret, remote write, or activation was created by this story.
