# Collaboration Foundation Phase 7 — Create workspace journey

Status: **PASS — `CF-P7-004`, entry `P7-G2A`, exit `P7-G2B`**

Surface 3 of twelve. `P7-G2B` authorizes `CF-P7-005` only.

## 1. What this story owns

The journey that takes a person from "I want a workspace" to being inside one:
naming it, creating its key on this device, and creating it. Nothing else. It
adds no route, no schema, no key primitive, and no network transport of its own —
every collaborator is injected and every call goes to a service that already
exists and was qualified in an earlier phase.

## 2. The ordering rule this journey exists to respect

`POST /api/v1/workspaces` is not a single call. The API contract splits it:

1. **`POST /workspaces/bootstrap-intents`** — the server derives the opaque
   `workspaceId` from the live user, device, and `Idempotency-Key`, and returns
   `{ workspaceId, initialKeyVersion: 1, ownerDeviceId, ownerFingerprint }`. It
   stores nothing and creates nothing.
2. **The client seals the creator envelope** against that binding, and only then.
3. **`POST /workspaces`** — one D1 batch creates the workspace, the Owner
   membership, key version 1, the creator envelope, and the audit event, using
   the **same** `Idempotency-Key`.

The ordering is not a style preference. The envelope is cryptographically bound
to a workspace id, key version, and device fingerprint that the client does not
choose. Generating key material before step 1 returns would mean binding it to
values the client guessed, and the server would reject the result — or worse,
accept an envelope bound to the wrong device.

The gate enforces the order structurally: it locates the three call sites in the
module and fails if sealing appears before the intent, or if the create appears
before the sealing.

## 3. Why one idempotency key, and why a retry reuses it

Both calls carry the same key, and a retry is given the original key rather than
a new one.

A create that failed *after* the mutation reached D1 is indistinguishable, from
the client, from one that failed before it: the network error looks the same
either way. If a retry minted a fresh key, the server would read it as a second,
unrelated request and could commit a second workspace. The user would then own a
workspace they never asked for, containing nothing, indistinguishable from the
one they wanted.

So `runCreateWorkspace` mints a key in exactly one place, sends it to both calls,
and returns it on both the success and the failure path. A caller resuming an
attempt passes it back in. The gate counts the minting sites and fails on a
second one.

## 4. The name rule is mirrored, not owned

`validateDisplayName` mirrors the server rule in
`functions/_lib/workspaces/workspace-bootstrap.ts`: 1 to 80 code points, already
trimmed, no control characters.

Two things about that mirror matter.

**It counts code points, not UTF-16 units.** The server counts
`[...displayName].length`. A mirror using `.length` would reject a valid
40-emoji name — a mirror that is *stricter* than the rule it mirrors is still
wrong, because it blocks names the product actually allows. The gate asserts the
spread form is present, and a unit test pins an 80-emoji name as valid while
noting its UTF-16 length is 160.

**It is not authority.** The server still validates, and `VALIDATION_FAILED`
remains a reachable outcome. The mirror exists so the control is never enabled
into a failure, which the contract §5 forbids.

The gate reads the bound out of the server file and compares it, rather than
repeating `80` a third time where it could silently disagree.

## 5. Preconditions are stated, never discovered on submit

Creating a workspace requires a session **and an active own device**, because a
creator envelope has to be sealed to one.

When there is no such device the submit control stays visible, is
programmatically disabled, carries the reason in text, and offers the route to
the device journey that CF-P7-005 will own. It is not hidden, and it never looks
enabled and fails afterwards. An unknown session renders as "checking" rather
than guessing signed-out, matching the decision CF-P7-003 made for the account
menu.

## 6. Errors

Every code in the frozen taxonomy is mapped, using the contract's own
presentation strings so the gate can compare the two tables value for value
instead of matching two vocabularies that drift apart quietly.

`CF-P7-016` took that taxonomy from twelve codes to the server catalog's
twenty-nine and corrected two spellings, so this table now has twenty-nine rows
and names `AUTHENTICATION_REQUIRED` and `REAUTHENTICATION_REQUIRED` where it used
to name `UNAUTHENTICATED` and `RECENT_AUTHENTICATION_REQUIRED`. **The reachable
subset is unchanged at ten.** These two routes return what they always returned;
the wire spellings still arrive and are joined onto the catalog codes by the API
client, so no journey behaviour moved.

`DOCUMENT_REVISION_CONFLICT` and `RESOURCE_NOT_FOUND` remain the two the journey
demonstrably cannot produce: a create has no base revision to conflict against
and addresses no existing resource. They stay in the mapping and out of the
reachable set, as do the other seventeen the journey has no route to. A code
outside the reachable set is reported as an unexpected response rather than
flattened into the generic error bucket where nobody would ever notice it — and
the gate now computes the unreachable set as the complement of the reachable one
rather than reading back a list.

## 7. Two safeguards worth naming

- **The binding's device is compared before sealing.** If the server bound a
  device other than the one asked about, the journey stops rather than sealing an
  envelope to the wrong device.
- **The created id is compared before it becomes the selection.** Landing the
  user in a workspace other than the one they just created is the same failure
  U2 exists to prevent, arriving by a different road.

Writing the selection here *is* legitimate, and the distinction is worth keeping
straight: CF-P7-003 refuses to substitute a workspace the user did not choose.
Here the user chose it, by creating it.

## 8. Verification

- `cf:phase7:create:check` — the story gate, wired into `check:cloudflare`.
- `tests/collaboration-create-workspace.test.mjs` — 41 unit tests.
- `tests/cloudflare-phase-7-create-workspace-policy.test.mjs` — 32 drift cases,
  each mutating one thing and asserting the gate rejects it.
- Browser qualification at 320 px, keyboard-only, light and dark.

## 9. Boundaries held

No route, no schema, no migration, no remote environment, no production
anything. No personal storage key is referenced, no `innerHTML` is used, no
`fetch` is performed inside the module, and no collaboration module became an
eager script tag or a service worker precache entry.
