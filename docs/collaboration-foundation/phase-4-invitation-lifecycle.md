# Phase 4 invitation lifecycle

Status: PASS

Story: `CF-P4-004`

Gate: `P4-G3` APPROVED

The invitation service implements create, replacement, bounded pending-list, privacy-safe bootstrap, revoke, and accept over the disposable/local D1 contract. Owner may offer Admin, Editor, or Viewer. Admin may offer only Editor or Viewer. The central live-D1 RBAC decision runs before GitHub lookup, while every write batch repeats the decisive authority and target-state predicates so a role, device, workspace, invitation, or membership race fails closed.

Each capability contains a non-secret UUID locator and a 256-bit CSPRNG secret. Web Crypto HMAC-SHA-256 binds the secret to the invitation ID; D1 stores only the 32-byte authenticator. The raw capability is returned only after the first durable commit. Idempotent replay returns the safe invitation result without re-exposing the capability. GitHub lookup is bounded to 8 KiB and five seconds, uses manual redirects, and binds acceptance to the immutable numeric provider subject rather than the display login.

Creation and resend leave exactly one pending invitation for a workspace/provider subject. Replacement terminalizes the previous invitation in the same D1 batch. Bootstrap exposes only the approved display name, target login snapshot, role, expiry, state, and optional identity-match boolean. At authoritative time equal to expiry the capability is unavailable. Revocation and acceptance are terminal; concurrent acceptance converges on one transition guard, one membership, and one audit event.

Acceptance requires the exact active GitHub identity and its active device. It creates or renews a membership authorization episode in `pending_key`, incrementing `role_version` when a removed member rejoins. It never creates a workspace-key envelope or grants protected document authority.

No HTTP route imports this service. No migration, Wrangler binding, remote D1 write, Preview business-route activation, production identity activation, or collaboration activation was added.

Next decision: `P4-G4` may authorize `CF-P4-005` only.

