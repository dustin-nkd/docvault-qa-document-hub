# CF-EV-P4-OPS-001 — Preview deployment boundary

Status: PASS

Story: `CF-P4-007`
Gate: `P4-G6`

The integration targets only `codex-cf-p3-preview.docvault-qa-document-hub.pages.dev`. It requires the existing Preview D1 and identity bindings; missing configuration fails closed. The cursor key is derived with a dedicated HKDF label from the active Preview CSRF key, so no project-wide secret is introduced. Production has no D1 binding, `COLLABORATION_ENABLED` remains false in every environment, and GitHub Pages remains a static fallback without API authority.
