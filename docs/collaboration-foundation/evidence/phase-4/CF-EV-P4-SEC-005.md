# CF-EV-P4-SEC-005 Membership security evidence

Status: PASS

Story: `CF-P4-005`

Gate: `P4-G4`

Authorization is loaded from live D1 and repeated inside each write batch. Tests deny stale versions, lower-role administration, direct Owner manipulation, self-removal, old authentication, missing key readiness, and access immediately after removal. Member responses contain no document semantics, provider subject, token, device key, fingerprint, or envelope material.
