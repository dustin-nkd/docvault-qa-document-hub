# CF-EV-P2-UT-001 Typed persistence unit evidence

Status: PASS

Story: `CF-P2-004`

Gate authorization: `P2-G2` `APPROVED`

The typed persistence suite rejects zero or unexpected write counts, missing metadata, partial or duplicate result rows, invalid page limits, invalid guarded-batch topology, and malformed mapped rows with stable non-SQL error codes. Authorization sessions begin at `first-primary`; only bookmarks captured from a server-created D1 session can be reused.

Source policy rejects dynamic SQL interpolation, `SELECT *`, unchecked D1 execution, manual transactions, unsafe casts, unconstrained sessions, and persistence imports from the disabled API dispatcher. Tests are local-only and create no remote D1 resource.
