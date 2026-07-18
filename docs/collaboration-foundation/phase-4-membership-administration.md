# Phase 4 membership administration

Status: PASS

Story: `CF-P4-005`

Gate: `P4-G4` APPROVED

The membership administration service implements bounded member listing, role changes, member removal, and dedicated ownership transfer over live D1 authority. Owner may change Admin, Editor, and Viewer roles within the approved ceiling. Admin may change only Editor and Viewer. Direct Owner assignment, direct Owner removal, self-removal, and lower-role administration are denied.

Every mutation uses a server-generated actor/device/workspace context, a 32-byte request fingerprint, optimistic `role_version`, and one guarded D1 batch. The batch repeats actor role, active membership, active device, target role/state/version, and operation-specific predicates. An authorized identical replay returns the original result and never repeats the domain mutation or audit event. A conflicting audit insert rolls back the ledger and every domain write.

Member removal atomically marks the membership removed, increments its authorization episode, revokes a matching pending invitation, revokes every current workspace key envelope for that user, marks the workspace `rotating`, and appends one allow-listed audit event. The removed principal is denied on the next live authorization read. The actual key-rotation cryptography remains owned by Phase 5.

Ownership transfer is the only Owner-assignment path. It requires exact strong confirmation, session-derived authentication no older than 15 minutes, an active non-self target, and an active current-key envelope. One transaction promotes the target to Owner, demotes the acting Owner to Admin, increments both role versions, stores one idempotent result, and appends one audit event. Therefore the workspace never becomes ownerless, including under a stale or concurrent request.

Member listing uses workspace-scoped keyset pagination and exposes only approved identity display metadata, role/state/version, active-device count, and key-readiness. It does not expose provider subjects, device keys, fingerprints, envelopes, tokens, or document metadata.

No HTTP route imports this service. No migration, Wrangler binding, remote D1 write, Preview business-route activation, production identity activation, or collaboration activation was added.

Next decision: `P4-G5` may authorize `CF-P4-006` only: allow-listed immutable audit retrieval and pagination.
