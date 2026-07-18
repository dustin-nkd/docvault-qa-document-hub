# CF-EV-P4-UT-002 Invitation token and provider unit evidence

Status: PASS

Story: `CF-P4-004`

Gate: `P4-G3`

Workers tests prove the structured capability carries a 256-bit secret, Web Crypto verifies only the matching HMAC authenticator, the raw capability is never persisted, and idempotent replay redacts it. GitHub lookup normalizes the display handle, binds the numeric subject, limits the response to 8 KiB and five seconds, and uses manual redirects so credentials cannot follow a provider redirect.

