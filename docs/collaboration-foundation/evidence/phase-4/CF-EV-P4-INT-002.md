# CF-EV-P4-INT-002 Live D1 authorization resolution

Status: PASS

Story: `CF-P4-003`

Gate: `P4-G2`

The local disposable D1 harness proves authorization reads the current primary membership on every call: an Owner permission is allowed, the D1 role is changed to Viewer, and the next identical request is denied. Separate cases derive cross-workspace non-membership, a revoked acting device, missing key readiness, and user deactivation without client authority fields or cached role state. No remote D1 operation was performed.
