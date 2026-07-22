# CF-P5-005 workspace key bootstrap, envelopes, and readiness

Status: PASS

Gate `P5-G2B` authorized local workspace-key foundation services only. The browser creates each 32-byte workspace DEK with Web Crypto. The API-side intent is stateless and deterministically binds the future workspace UUID to the live user, active owned device, and idempotency key without writing D1.

Final bootstrap validates the creator envelope's exact workspace, user, device, fingerprint, wrapper, suite, and key-version AAD. One D1 batch commits the workspace, active Owner membership, current key version 1, creator-device envelope, idempotent result, and allow-listed audit event. Any failed statement rolls back the entire workspace.

Provisioning reloads a live Owner/Admin membership, active owned wrapper device, valid session, current workspace version, unrevoked current wrapper envelope, authorized target membership, active target device, and canonical target fingerprint in the same transaction. It inserts one unique target envelope and derives the `pending_key` to `active` transition. Clients cannot write readiness.

No HTTP route imports the workspace-key service. No migration, remote D1 write, Wrangler binding, secret, Preview deployment, Production identity, or collaboration activation changed. Sequence 12 remains reserved for the separately gated rotation schema.
