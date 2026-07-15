# CF-EV-P1-STA-001 — Exact Cloudflare dependency and lock evidence

Status: PASS

Date: 2026-07-15

Story: `CF-P1-002`

Owner: Technical Lead

Reviewer: Senior QA

## Claims

- Wrangler `4.111.0`, TypeScript `7.0.2`, Vitest `4.1.10`, and Workers Vitest pool `0.18.5` are exact direct development dependencies.
- Manifest, lockfile root, resolved lockfile package, and installed package versions are identical.
- Wrangler reports major v4 and runs through its local Node entrypoint.
- Node 22 satisfies Wrangler and Vitest engine requirements; Workers pool peer requirements match Vitest 4.1.
- `npm audit` reports zero vulnerabilities at capture time.

Commands: `npm run cf:toolchain:check`, `npm ls wrangler typescript vitest @cloudflare/vitest-pool-workers --depth=0`, clean `npm ci`, `npm audit`, and `npm run check`.

Clean-install result: `npm ci` installed 159 locked packages, left `package-lock.json` unchanged at SHA-256 `c3471d39db1784dd46a151c51ece67181279d32b15d453f4612cc26d0a844e63`, resolved all four exact versions, and reported zero vulnerabilities.

Traceability: `CF-OPS-002/003`, `CF-NFR-002`, `R19`, and `T20`.

Privacy and side effects: package registry reads and local dependency installation only. No Cloudflare API mutation, authentication command, deployment, binding, secret, runtime route, or product data change occurred.

Implementation commit `cb6e5ecb1d79cae81e8a7ec0d6fe1b01b851936c` passed clean Linux `npm ci`, exact local tool resolution, the 63-test quality gate, production build, browser regression, and dependency audit in GitHub Actions run `29427363518`.
