# CF-EV-P5-OPS-003 Phase 5 remote reconciliation

Status: PENDING AUTHORIZED REMOTE RECONCILIATION

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
authorization and has not been executed by this evidence assembly.

PASS requires a post-transition read-only verification of zero active users,
sessions, workspaces, memberships, devices, pending OAuth transactions, auth
rate windows, unrevoked envelopes, documents, document revisions, and foreign-
key violations, with all append-only history retained. No shared Preview restore
is authorized or required.
