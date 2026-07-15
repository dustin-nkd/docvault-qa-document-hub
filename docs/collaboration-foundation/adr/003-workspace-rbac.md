# ADR-003: Workspace RBAC

## Status

Approved at Gate G2 as the Phase 0 domain baseline; this ADR does not authorize runtime implementation.

## Date

2026-07-15

## Owners

- Decision owner: Product Owner
- Technical owner: Technical Lead
- Required assurance: Security Reviewer and Senior QA

## Context

Collaboration requires a server-authoritative permission model that separates workspace governance, document editing, read-only participation, removed principals, and guests. The existing personal master password, GitHub identity, GitHub Sync credentials, public-share possession, and client UI state are not workspace authorization.

The policy must preserve one Owner, prevent Admin self-escalation, apply revocation on the next request, and remain independently testable across every route. Cryptographic readiness is an additional gate: a valid role does not make a `pending_key` member or device able to use protected documents.

## Decision

Use four workspace roles with fixed ceilings: Owner, Admin, Editor, and Viewer. A removed principal and a Guest/unauthenticated principal have no workspace authority. The API evaluates current session, same-workspace membership, membership state, device state, resource state, and action permission for every protected request.

The Owner alone controls Admin grants, ownership transfer, Admin removal, export, and deletion. Admin can manage Editors and Viewers but cannot affect an Owner or Admin. Owner, Admin, and Editor can mutate eligible documents; Viewer is read-only. Export and deletion remain deny-closed until their lifecycle contracts are approved.

## Detailed contract

### Authorization evaluation

For each protected request the server must, in order:

1. Validate the live session and derive `actorId`; ignore client actor, role, membership, ownership, and timestamps.
2. Resolve the resource and membership within the same `workspaceId` scope.
3. Require membership state appropriate to the action. Protected content requires `active`; provisioning/recovery may operate from explicitly allowed pending states.
4. Validate the acting device for device-bound operations. Protected document use also requires a current valid key envelope for that device.
5. Evaluate the centralized action policy below.
6. Perform the mutation and its authoritative audit event within the defined consistency boundary.

Failures are deny-by-default, privacy-safe, and non-enumerating. Authorization is re-evaluated when an offline mutation is submitted.

### Role/action matrix

Legend: **A** = allowed only when all preceding gates pass; **D** = denied.

| Action | Owner | Admin | Editor | Viewer | Removed | Guest / unauthenticated |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Read workspace summary | A | A | A | A | D | D |
| List/read eligible encrypted documents and revisions | A | A | A | A | D | D |
| Create/update/delete eligible document | A | A | A | D | D | D |
| Copy eligible personal document into workspace | A | A | A | D | D | D |
| List members | A | A | A | A | D | D |
| Invite Editor/Viewer | A | A | D | D | D | D |
| Invite Admin | A | D | D | D | D | D |
| List pending invitations | A | A | D | D | D | D |
| Revoke Editor/Viewer invitation | A | A | D | D | D | D |
| Revoke Admin invitation | A | D | D | D | D | D |
| Change Editor ↔ Viewer | A | A | D | D | D | D |
| Grant/revoke Admin | A | D | D | D | D | D |
| Transfer ownership | A | D | D | D | D | D |
| Remove Editor/Viewer | A | A | D | D | D | D |
| Remove Admin | A | D | D | D | D | D |
| Remove Owner or last Owner | D | D | D | D | D | D |
| Register/revoke own device | A | A | A | A | D | D |
| Revoke another member's device | A | A¹ | D | D | D | D |
| Provision envelope for another device | A² | A² | D | D | D | D |
| View audit events | A | A | D | D | D | D |
| Export workspace | A³ | D | D | D | D | D |
| Request workspace deletion | A³ | D | D | D | D | D |

1. Admin may revoke devices belonging only to Editors/Viewers.
2. Acting device must be active and key-ready; target must be an active member's active device. Provisioning does not confer member-management authority.
3. Endpoint remains unavailable until export/deletion format, retention, recovery, confirmation, and audit contracts are accepted.

### Ownership and membership rules

- Workspace creation atomically creates the workspace, creator's Owner membership, initial key version, and audit event.
- A workspace always has at least one valid Owner. Last-Owner downgrade/removal is rejected atomically, including under concurrent requests.
- Ownership changes only through a strongly confirmed transfer. Direct assignment, Admin self-promotion, and implicit transfer through removal are invalid.
- Admin cannot grant Admin, modify/remove an Owner or Admin, invite an Admin, or grant beyond the Admin ceiling.
- Role change or removal takes effect on the next request. Removed membership is terminal for that authorization episode; rejoining requires a new invitation.
- `pending_key` preserves the offered role but cannot use protected document read/write routes until key-ready.

## Alternatives

- **Owner and Member only:** rejected because routine administration and read-only participation need distinct least-privilege boundaries.
- **Client-side/UI authorization:** rejected because direct API calls would bypass it.
- **Admins equal to Owner:** rejected because ownership, Admin grants, destructive lifecycle, and export are higher-risk controls.
- **Per-document ACLs:** rejected as Foundation scope expansion and inconsistent with the workspace-role product model.
- **OAuth/provider teams as authority:** rejected because provider identity is not DocVault workspace membership.

## Consequences

Positive consequences:

- One auditable policy source supports UI derivation, API enforcement, and parameterized tests.
- Admins can perform routine Editor/Viewer management without controlling ownership or other Admins.
- Viewer, removed, and Guest denial is explicit for direct API calls.

Costs and limitations:

- Every request and queued retry requires live authorization checks.
- Membership removal cannot erase plaintext already viewed or copied.
- Export/deletion remain unavailable until their separate decisions close.

## Security/privacy

- Queries bind authenticated membership and resource to the same workspace; opaque IDs are not authorization.
- Denials do not disclose whether an out-of-scope resource exists.
- Client-supplied actor, role, owner, workspace authority, device ownership, and time are ignored.
- Audit events use server actor/time and allow-listed metadata, never document content, tokens, keys, or ciphertext bodies.
- Public-share tokens, personal vault secrets, GitHub PATs, and provider identity cannot grant workspace authority.
- Revocation blocks future service access and future key delivery; product language must not claim remote erasure.

## Operations

- Policy is versioned and implemented centrally across `/api/v1/*`.
- Security-relevant allow/deny outcomes use privacy-safe request IDs and structured allow-listed logs.
- Feature disablement must preserve collaboration data and Personal Vault availability.
- Policy changes require migration impact review, traceability updates, and regression of all role/action cases.

## Test implications

- Parameterize every action for Owner, Admin, Editor, Viewer, `pending_key`, removed, revoked-device, Guest, and unauthenticated states.
- Repeat resource cases for own workspace, another workspace, nonexistent opaque ID, deleted resource, and malformed ID.
- Forge actor, role, owner, workspace, device, and timestamp fields; verify server-derived persistence and audit values.
- Verify both response and side effects: membership, invitation, document revision, envelope, audit, logs, and outbox.
- Race last-Owner removal and ownership transfer; the invariant must hold atomically.
- Change role/remove member/revoke device while online and offline work is queued; the next request must use current authority.
- Viewer direct mutations and every removed/Guest operation must create no business mutation.

## Requirement/threat links

- Requirements: CF-WS-001–004, CF-RBAC-001–004, CF-INV-001, CF-DEV-003, CF-KEY-003/005/006, CF-DOC-002, CF-SYNC-005, CF-AUD-001, CF-ISO-004/005.
- Product journeys: J2, J3, J4, J7, J9.
- Abuse cases: AB-04, AB-05, AB-06, AB-14, AB-21, AB-23.
- Primary threats: IDOR, privilege escalation, stale authorization, forged attribution, ownerless workspace, key delivery to an unauthorized device.

## Gate G2 acceptance

- [x] Product Owner approves the role hierarchy and action ceilings.
- [x] Admin cannot grant Admin, affect Owner/Admin, transfer ownership, export, or delete.
- [x] Last-Owner and `pending_key` rules are explicit.
- [x] Removed and Guest/unauthenticated denial is explicit.
- [x] Security Reviewer approves the centralized authorization and non-enumeration contract.
- [x] Export/deletion remain deny-closed until their later API/lifecycle contracts are approved.
- [x] Day 4 API schema, error catalog, audit schema, and policy-test fixture must reference this ADR.
- [x] Senior QA accepts the authorization/race/side-effect evidence plan; executable evidence remains a Phase 1 release gate.

Gate G2 remains open for the complete Product Owner decision package. Acceptance of this domain decision is not implementation readiness.
