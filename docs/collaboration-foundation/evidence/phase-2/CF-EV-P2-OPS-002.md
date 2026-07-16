# CF-EV-P2-OPS-002 — Disposable D1 recovery rehearsal

Status: PASS

Story: `CF-P2-008` | Gate: `P2-G4` APPROVED on 2026-07-16

Operations read a current shared-preview Time Travel bookmark without restoring it, then created exactly one disposable APAC recovery database with read replication disabled. The database received the immutable migrations `0001` through `0009` and a synthetic encrypted fixture. A baseline bookmark was recorded, one committed mutation was added, and an authorized Time Travel restore completed in 3,791 ms. Native Time Travel restored the entire fixture, so a separate export/import fallback was not required for this rehearsal.

The returned undo bookmark was fingerprinted for the documented abort path. The disposable database was deleted after verification; an exact-name lookup returned zero resources and no Wrangler or Pages binding referenced it.
