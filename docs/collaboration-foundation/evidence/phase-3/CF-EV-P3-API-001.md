# CF-EV-P3-API-001 — GitHub provider contract evidence

Status: PASS

Story: `CF-P3-004`

Date: 2026-07-16

The isolated adapter uses the exact GitHub token and authenticated-user endpoints, POST form encoding, PKCE verifier, exact callback URI, JSON media type, and manual redirect rejection. A 3xx response is rejected locally and never followed, so the client secret or bearer token cannot be forwarded to another origin. It uses a 5-second request timeout and an 8-second overall provider budget. Token exchange is never retried. Identity lookup retries once only for 429/502/503/504 with delay capped at one second. Response bodies are streamed into a 16 KiB hard limit.

`GET /user` is revalidated after every exchange. Only a positive safe decimal GitHub `id` becomes `provider_subject`; login, name, and HTTPS avatar URL are bounded display metadata. The current reviewed REST header is `X-GitHub-Api-Version: 2026-03-10`.

References: [GitHub OAuth web flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub authenticated user endpoint](https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10).

No route invokes this adapter and no real provider request was made.
