# CF-P5-004 device services implementation

Status: PASS

Gate `P5-G2A-M` authorized the forward-only additive sequence-11 correction needed before the first device exists and before a workspace exists. Rotation persistence is now reserved for sequence 12.

Registration validates an exact public-only P-256 JWK, canonicalizes it, derives the fingerprint on the server, and commits the device, one allow-listed audit event, and one session-scoped idempotency result in a single D1 batch. The private key and protected browser envelope are never accepted.

Inventory is restricted to the authenticated user's devices, capped at 100 rows, and ordered by the stable `(created_at DESC, id DESC)` keyset. Revocation is an irreversible active-to-revoked transition for an owned device. A revoked device fails the shared active-device authority lookup used by later envelope services.

No HTTP route imports the device service. No remote D1 migration, Wrangler binding, secret, Preview activation, production identity, or collaboration capability changed.
