# CF-EV-P6-SEC-008 Preview document boundary security

Status: PASS

Story: `CF-P6-008`

Live probes against the isolated Preview alias confirm the document slice is reachable but closed. All eight document routes — list, create, read, update, tombstone, revision list, revision read, and mutation reconcile — return `401 UNAUTHENTICATED` without a session. None returns `404` or `405`, which would mean the route was never registered, and none returns data.

The three mutations return `403` when submitted with a hostile `Origin` of `https://evil.example`. Origin and CSRF validation therefore fire before authentication, so a cross-site request is refused without the server doing session work on its behalf.

Environment isolation holds. On Production both `/api/v1/workspaces/{id}/documents` and `/api/v1/session` return `503 COLLABORATION_UNAVAILABLE`, and Production still has zero D1 bindings. On the GitHub Pages fallback the same document path returns `404` — there is no API runtime there at all.

Origin pinning is verified by an accidental but useful control: the per-deployment hostname `ea66d321.docvault-qa-document-hub.pages.dev` serves `503 COLLABORATION_UNAVAILABLE` for every collaboration route, because it is not the approved Preview origin. The runtime is reachable only through the exact origin it was reviewed for, not through any URL that happens to resolve to the same build.

Remote business state is unchanged after the probe matrix: zero documents, zero document revisions, zero document audit events, zero active users, and zero active sessions. Only two bounded `auth_rate_windows` rows advanced, which is operational control state and not collaboration data. No probe created, read, or leaked ciphertext.

Scope limit stated plainly: this record covers the unauthenticated boundary only. The authenticated multi-role journeys — an Editor creating and a Viewer reading, a Viewer write being denied, a two-writer conflict, a retry, and an offline replay, all over real Preview sessions — were NOT executed, because they require a synthetic GitHub OAuth login. That login cannot be performed from this environment, and a session cannot be minted directly either: the `SESSION_TOKEN_PEPPER` needed to compute a valid session digest is a Preview secret that is deliberately not readable here. Those scenarios remain outstanding and are the reason `CF-P6-008` is not PASS.
