# CF-EV-P4-SEC-006 Audit privacy and tenant-isolation evidence

Status: PASS

Story: `CF-P4-006`

Gate: `P4-G5`

Security tests deny Editor, Viewer, removed users, non-members, and cross-workspace enumeration. Authorization occurs before cursor verification on every page. Unknown or privacy-unsafe D1 rows fail the whole page closed, and raw `metadata_json` is never returned.
