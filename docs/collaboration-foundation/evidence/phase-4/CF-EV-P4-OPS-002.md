# CF-EV-P4-OPS-002 - Read-only recovery and deployment reconciliation

Status: PASS

Story: `CF-P4-008`
Gate: `P4-G7`

Wrangler read-only queries confirmed Preview schema 10, ten applied migrations, no pending migration, zero foreign-key violations, zero collaboration business rows, and two bounded rate-limit control rows. The current Preview and Production deployment IDs are recorded alongside the prior immutable deployment.

D1 Time Travel availability is represented only by a SHA-256 fingerprint of the returned bookmark; the raw bookmark is not committed. The previous runtime commit and current runtime both support schema 10. Its immutable deployment still fails closed rather than exposing collaboration. Recovery commands performed no write and no shared Preview restore occurred. Boundary probes may advance bounded rate-control counters, but aggregate reconciliation proves they created no collaboration business data. Restore remains a separately controlled destructive operation because it overwrites database state.
