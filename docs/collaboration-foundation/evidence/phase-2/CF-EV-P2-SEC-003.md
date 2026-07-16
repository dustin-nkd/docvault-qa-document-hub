# CF-EV-P2-SEC-003 Cross-tenant and schema privacy evidence

Status: PASS

Story: `CF-P2-003`

Gate: `P2-G2` `REVIEW_REQUIRED`

Forward migration 0007 adds deny-by-default tenant guard triggers for invitation, key version/envelope, document/revision, mutation, audit, and retention-hold writes. Key-envelope target fingerprints must match the bound device, key versions cannot skip sequence numbers, and workspace current-key changes require a same-workspace current key.

Query contracts bind `workspace_id` for every tenant resource and return no existence distinction for foreign versus absent IDs. Schema, indexes, query contracts, fixtures, and evidence contain no document plaintext, raw tokens, private keys, plaintext DEKs, or server-search fields.

No remote D1 resource or binding exists, collaboration remains disabled, and Gate P2-G2 remains REVIEW_REQUIRED pending explicit sign-off.
