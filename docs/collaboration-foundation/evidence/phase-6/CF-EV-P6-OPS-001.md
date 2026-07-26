# CF-EV-P6-OPS-001 Preview document slice deployment

Status: PASS

Story: `CF-P6-008`

`P6-G4` was granted on 2026-07-26. One isolated Preview deployment activated the eight Phase 6 document routes: the `codex-cf-p3-preview` branch was fast-forwarded from `6ee65d0` to `dd402b9`, which produced Cloudflare Pages Preview deployment `ea66d321-fd38-4e0c-bcc5-d30c8191f5d1`. The update was a clean fast-forward — the branch held no commit that `main` lacked — so no history was rewritten and no force push was used.

No secret, binding, environment variable, provider application, or migration was created or changed. The deployment inherits the Preview environment configured at `P3-G4` and `P5-G4`; schema stayed at 12 with all twelve migrations applied.

The pre-deployment baseline was captured first: on the Preview alias `/api/v1/workspaces/{id}/documents` returned `503` (the route did not exist and fell through to the disabled shell) while `/api/v1/session` returned `200`, confirming the Phase 3 identity runtime was already live. After deployment the same document path returns `401 UNAUTHENTICATED`, which is the route existing and demanding a session.

An unexpected result was investigated rather than assumed. The per-deployment URL `ea66d321.docvault-qa-document-hub.pages.dev` returns `503 COLLABORATION_UNAVAILABLE` for both the Phase 5 and Phase 6 routes, while the branch alias serves them normally. This is the origin isolation working as designed: the runtime pins the exact Preview origin, so a deployment-specific hostname is not the approved origin and the handler declines to claim the route. It is recorded here because a future operator seeing a 503 on a deployment URL should not read it as a broken deploy.

Remote state after the qualification probes is unchanged for business data: zero documents, zero document revisions, zero document audit events, zero active users, and zero active sessions. Two `auth_rate_windows` rows advanced, which is bounded operational control state produced by unauthenticated probes and not collaboration business data, consistent with what Phases 4 and 5 recorded.

Rollback remains the previous Preview deployment `858989d1-7b16-4ebd-a9fe-bd1dfeb10f1b` from commit `199b712`, which is the Phase 5 qualification build on the same schema 12 contract. No shared Preview restore was performed and none is required, because the deployment added routes without touching data.
