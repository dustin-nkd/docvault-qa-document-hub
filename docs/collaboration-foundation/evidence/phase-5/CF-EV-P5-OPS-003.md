# CF-EV-P5-OPS-003 Phase 5 remote reconciliation

Status: PASS

Read-only inspection of the isolated Preview D1 on 2026-07-22 confirmed schema
12 and zero foreign-key violations. Active sessions, pending OAuth transactions,
auth rate windows, documents, and document revisions are zero. One active
qualification user, workspace, membership, and device remains, together with
two unrevoked encrypted workspace-key envelopes.

The initially proposed physical purge is invalid. Retained append-only
key-version, envelope, rotation, mutation, and audit history has restrictive
foreign keys to those parent rows, and several journals have no-delete triggers.
The reviewed reconciliation therefore retires authority in place: revoke the
encrypted envelopes and device, remove the membership, tombstone the workspace,
and deactivate the user. Revoked/consumed parent and history rows remain subject
to their retention policies. The operation requires explicit destructive remote
authorization. The Product Owner granted that authorization on 2026-07-23.

A disposable Workers D1 rehearsal passed four of four cases before execution.
One remote batch then ran seven statements atomically with nine logical changes:
it revoked two encrypted envelopes, retired the current key version, revoked the
device, removed the membership, transitioned the workspace through
`deletion_pending` to `deleted`, and deactivated the user. It used no `DELETE`
and no restore. Pre/post Time Travel bookmark SHA-256 fingerprints are
`3753b85003dc8cc078552d721e0e1a27a8a043173ac4646f3735c42cbf859eda` and
`387292c483af913ec6b43ae1ca35d4251b61e6f79f091290073275361b59ee74`;
raw bookmarks are intentionally omitted.

Post-transition verification confirmed schema 12 and zero active users,
sessions, workspaces, memberships, devices, current key versions, pending OAuth
transactions, auth rate windows, unrevoked envelopes, documents, document
revisions, and foreign-key violations. Retained physical history is one user,
session, workspace, membership, and device; two key versions and two encrypted
envelopes; one rotation and one rotation target; four workspace mutation results,
one device mutation result, four workspace audit events, and one device audit
event. No shared Preview restore was performed.
