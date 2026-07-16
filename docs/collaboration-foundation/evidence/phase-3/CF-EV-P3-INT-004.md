# CF-EV-P3-INT-004 — Authoritative abuse-control integration

Status: PASS

Story: `CF-P3-007`

Disposable D1 applies schema 10 and atomically caps a shared OAuth source window at 20 successful increments under 25 concurrent attempts. User and source tiers remain separate, raw discriminators are never persisted, and expired rows are removed only in bounded batches of at most 100.
