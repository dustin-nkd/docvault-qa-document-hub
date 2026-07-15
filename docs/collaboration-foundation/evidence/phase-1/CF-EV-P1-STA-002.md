# CF-EV-P1-STA-002 — Cloudflare command portability and fail-closed evidence

Status: PASS

Date: 2026-07-15

Story: `CF-P1-002`

Owner: Technical Lead

Reviewer: Senior QA and Security Reviewer

## Claims

- Every `cf:*` script delegates to a Node dispatcher and a local package entrypoint.
- Commands contain no `npx`, `latest`, runtime installation, shell interpolation, secret argument, remote-resource command, or deployment command.
- Windows and Linux use the same Node entrypoints and argument arrays.
- Toolchain and configuration checks are active now.
- Types, Pages dev, Workers tests, Functions build, and dry-run inspection fail with an explicit phase prerequisite until their reviewed files exist.
- The dry-run command compiles locally and cannot deploy.

Negative tests mutate a command to `npx wrangler@latest`, change the Pages dev command, drift direct/lock/installed versions, remove an expected action pin, change `npm ci` to `npm install`, and alter the date/review policy. Every mutation must throw.

Traceability: `CF-OPS-002/003`, `CF-NFR-002`, `R19`, and `T20`.

Implementation commit `cb6e5ecb1d79cae81e8a7ec0d6fe1b01b851936c` ran the same Node dispatcher successfully on Windows locally and Linux CI. Deferred type and Functions commands returned non-zero before their prerequisite stories; no remote command ran.
