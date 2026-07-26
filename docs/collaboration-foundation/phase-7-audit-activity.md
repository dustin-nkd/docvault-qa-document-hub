# Collaboration Foundation Phase 7 — Audit activity

Status: **PASS — `CF-P7-011`, entry `P7-G3C`, exit `P7-G3D`**

Surface 10 of twelve. `P7-G3D` authorizes `CF-P7-012` only.

## 1. Refusing beats trimming

The audit log is the place a leak would be least noticed. A stray field rendered
among fifteen legitimate ones does not look wrong, and a client that quietly
trimmed it would destroy the only signal that something upstream changed.

So each event is projected onto the frozen 17-field `AuditEventView` allow-list,
and an event carrying anything outside it is **refused**. A server that began
returning free text, ciphertext, a token, a stack, or a document title surfaces
here as a refusal rather than as content on a page.

That is a deliberate trade: a genuinely new field requires a contract change, and
a contract change is exactly the moment this refusal should be noticed.

The gate compares the rendered field set against the contract's own fenced
declaration, parsed out of `api-contract.md` rather than copied into the policy,
so the two cannot drift apart independently.

## 2. Three filters, and no content query

`eventType`, `occurredFrom`, `occurredTo`. Anything else is refused before a
request is made. An audit log with a content search would become an index over
material the contract says the server never holds in the clear.

## 3. Restricted, not hidden

Owner and Admin only — and an editor or viewer still **sees** the surface, with
the control disabled and the reason stated, because the contract forbids hiding a
restricted surface. A denied role receives zero events in its model and cannot
paginate even if a cursor happens to be present, so the restriction is not merely
visual.

An exhausted log and a denied one say different things, because they are
different situations.

## 4. Verification

- `cf:phase7:audit:check`, wired into `check:cloudflare`.
- `tests/collaboration-audit-activity.test.mjs` — 24 unit tests.
- `tests/cloudflare-phase-7-audit-policy.test.mjs` — 22 drift cases, including
  one per forbidden field.

## 5. Boundaries held

No route, no schema, no remote environment, no personal storage key, no
`innerHTML`, no `fetch`, and no client-constructed cursor.
