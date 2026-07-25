# CF-EV-P6-SEC-007 Conflict and copy security review

Status: PASS

Story: `CF-P6-007`

No draft is ever lost silently. A conflict retains the encrypted draft from the moment it opens, and of the four contracted resolutions only `discard-with-confirmation` clears it. That path refuses without an explicit confirmation flag, and a test enumerates every other option asserting the draft is still retained, so a future option cannot quietly join the losing set.

Automatic merge does not exist and cannot be added by accident. `mergeConflict()` is present solely to throw `AUTOMATIC_MERGE_PROHIBITED`, and an unrecognised resolution name is rejected rather than silently ignored. A conflict that is already resolved or discarded cannot be resolved a second time, so a replayed click cannot produce a second submission.

`reapply-to-latest` rebases onto the revision the server actually holds rather than the stale base the user submitted, which is what prevents a resolution from immediately conflicting again. `save-as-separate-copy` targets a fresh document identifier at revision 1, so resolving a conflict never overwrites the other writer's work.

Credential documents are refused before any destination encryption. `assessCopyEligibility` marks them non-selectable so they are not offered in the picker at all, and `prepareWorkspaceCopy` performs the category check as its first action, before the role, key-readiness, and confirmation checks and before anything that would encrypt for the destination. This is verified in Node and in three browsers.

The residual risk from `ADR-007`, accepted at Gate G3, is restated rather than closed: the API cannot semantically inspect an encrypted category, so this guarantee is client-side only and a malicious authorized client could still submit a Credential. The module documents this at the eligibility function, and no evidence in this story claims server enforcement.

A copy is one-time and unlinked. The intent records `sourceMutated: false` and `linked: false`, carries a fresh document identifier, a fresh mutation identifier, revision 1, and a distinct destination workspace. Against real D1 the personal source has no workspace row after a copy, and a repeated copy replays to the original result leaving exactly one destination document.

A copy also requires an Owner, Admin, or Editor role at the destination, a key-ready destination, and an explicit data-classification confirmation; a Viewer destination, a non-key-ready destination, and a missing confirmation each fail with their own code.

No secret, token, key, or plaintext canary appears in the module, its tests, or this record. The module handles only opaque encrypted draft bytes and identifiers.
