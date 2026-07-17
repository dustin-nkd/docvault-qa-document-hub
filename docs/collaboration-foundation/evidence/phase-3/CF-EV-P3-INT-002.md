# CF-EV-P3-INT-002 — Atomic OAuth callback D1 evidence

Status: PASS

Story: `CF-P3-004`

Date: 2026-07-16

Disposable Workers D1 applies all nine immutable migrations and executes the callback as one prepared-statement batch on a `first-primary` session. Each transaction, subject, and predecessor compare-and-set is immediately followed by a zero-change SQL assertion. A failed guard therefore raises a constraint error and Cloudflare D1 rolls back the entire batch.

Executable cases prove one winner under concurrent callbacks, replay rejection, stable user identity after login changes, full rollback when session insertion conflicts, same-subject reauthentication with predecessor rotation, and full rollback for wrong-subject reauthentication. Successful sessions store only a 32-byte HMAC digest.

Result: 11 CF-P3-004 Workers tests passed, including closed privacy-safe provider failure classification, with zero skipped or flaky cases. Schema migrations added: 0. Remote D1 writes: 0.
