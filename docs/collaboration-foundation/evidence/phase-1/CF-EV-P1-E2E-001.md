# CF-EV-P1-E2E-001 — Cloudflare and GitHub Pages fallback isolation

Status: PASS

Date: 2026-07-15

Story: `CF-P1-005`

Result: The full Playwright regression passed locally against the production artifact. Fresh production browser contexts then loaded and reloaded Cloudflare Pages and GitHub Pages guest mode, rendered Dashboard successfully, made zero `/api` requests, and exposed zero collaboration/workspace controls. Both origins returned HTTP 200 and shipped Service Worker `v45`. GitHub Pages returned a static 404 for `/api/v1/session`; it did not return application shell HTML as a successful API response or start a retry loop.

GitHub Actions run `29432147843` passed the complete release pipeline and published the implementation commit to GitHub Pages.

Traceability: `CF-FB-001/002`, `CF-OPS-002`, `R15/R17`, `T16/T21`.
