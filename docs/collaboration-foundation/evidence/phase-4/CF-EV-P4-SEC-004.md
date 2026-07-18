# CF-EV-P4-SEC-004 Invitation abuse and privacy controls

Status: PASS

Story: `CF-P4-004`

Gate: `P4-G3`

Negative tests cover Admin role ceilings, Editor denial, existing-member concealment, wrong immutable identity, replaced/revoked/accepted capabilities, exact expiry, and replay. Provider lookup happens only after live RBAC authorization. Public bootstrap and acceptance failures share `INVITATION_UNAVAILABLE`; no raw token, request body, provider credential, mutable login authority, or key material enters D1, logs, URLs handled by the server, or audit metadata.

