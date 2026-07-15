# Day 1 Cross-Functional Review

Status: Gate G0 passed

Date: 2026-07-15

Scope: Product and system discovery only

## 1. Review objective

Confirm that Phase 0 has a correct product boundary, a verified inventory of the current system, an initial target boundary, a complete asset/actor inventory, and an explicit regression surface before the squad begins Day 2 domain and threat modeling.

## 2. Evidence reviewed

- `product-spec.md`
- `architecture.md`
- `data-classification.md`
- `quality-strategy.md`
- Current runtime, storage, sync, sharing, Service Worker, security headers, build scripts, deployments, and test suites referenced by those artifacts

## 3. Cross-functional conclusions

### BA / Product

Conclusion: Ready pending Product Owner confirmation.

- The problem is framed as safe team collaboration rather than realtime co-editing.
- Personal Vault, public sharing, guest mode, and workspace collaboration have distinct product boundaries.
- The minimum vertical slice and release-blocking failures are measurable.
- Credentials, attachments, comments, realtime presence, CRDT/OT, and organization hierarchy are explicitly outside Foundation.
- Personal-to-workspace adoption is an explicit one-time copy, never an automatic migration.

### Architecture / Development

Conclusion: Ready for Day 2.

- Current global document state, client-clock mutations, local vault encryption, sharded GitHub sync, public sharing, offline cache, and deployment paths have been verified.
- Extending GitHub Sync into a team backend is rejected because it lacks stable identity, membership authorization, authoritative revisions, and server audit semantics.
- The preferred target boundary is static Cloudflare Pages plus same-origin Pages Functions and D1.
- Durable Objects and R2 remain deferred until realtime coordination or attachments enter an approved phase.
- Personal and collaboration persistence must be separate providers.

### Security

Conclusion: Ready for STRIDE modeling with open ADR decisions recorded.

- Critical secrets, restricted content, internal security metadata, and public assets are classified.
- Browser, persistent storage, Service Worker, Pages, Pages Functions, D1, OAuth, GitHub Sync, public share, fallback, environment, and deployment boundaries are identified.
- The initial target never requires plaintext documents, workspace keys, private device keys, personal vault passwords, or GitHub PATs in D1.
- Known E2EE limitations are not represented as solvable by revocation: previously viewed or copied plaintext cannot be remotely erased.

### Senior QA

Conclusion: Ready for Day 2; Phase 1 remains blocked.

- Existing regression surfaces and current automated coverage are inventoried.
- New collaboration gaps are classified across unit, D1 integration, API contract, multi-user browser, security, performance, resilience, and accessibility levels.
- Preview and production require separate data, OAuth credentials, secrets, and test identities.
- The requirement-risk-control-test matrix is initialized but cannot be considered complete until the remaining Phase 0 decisions are closed.

### UX review

Conclusion: Product states are sufficiently enumerated for discovery; detailed UX remains future Phase 0 work.

Required states are already identified for workspace context, invitations, device initialization, role restrictions, saving, offline operation, conflict, access removal, and GitHub Pages fallback. No UI implementation is authorized by this review.

## 4. Consistency decisions

The squad adopts the following Day 1 baseline across all documents:

1. Cloudflare Pages is the canonical collaboration origin.
2. GitHub Pages is a personal/guest fallback, not a collaboration failover.
3. Pages Functions plus D1 are the preferred Foundation server boundary, subject to ADR approval.
4. Durable Objects are deferred until a separate realtime phase.
5. GitHub OAuth is the preferred identity provider, subject to the authentication ADR.
6. A local vault password is not a user identity and is never shared among workspace members.
7. Personal GitHub PATs and GitHub Sync never enter the collaboration backend.
8. Personal documents remain personal until an eligible document is explicitly copied.
9. Credential documents are not eligible for Collaboration Foundation.
10. Shared updates use authoritative revisions and idempotency; client timestamp last-write-wins is rejected.
11. Server-side authorization is mandatory for every workspace resource.
12. New repository artifacts and future UI are English-only.

## 5. Open decisions carried forward

These are expected Phase 0 decisions, not Day 1 defects:

- Stable OAuth identity and invitation targeting.
- Session duration, renewal, revocation, and CSRF contract.
- Exact encrypted versus server-visible metadata boundary.
- Device-key algorithm and local private-key protection.
- Recovery-kit and all-devices-lost behavior.
- Member removal, device revocation, and key-rotation triggers.
- Conflict UX and durable outbox storage.
- API errors, limits, pagination, and request IDs.
- D1 retention, migration ordering, backup, restore, and rollback.
- Supported browsers and expected workload.

Each item must receive an owner, ADR or specification decision, acceptance criteria, and planned verification before its dependent implementation becomes Ready.

## 6. Gate G0 assessment

| Gate condition | Result | Evidence |
|---|---|---|
| Problem, personas, outcomes, scope, and non-goals are documented | Pass | `product-spec.md` |
| Current runtime, storage, sync, sharing, offline, and deployment paths are inventoried | Pass | `architecture.md` |
| Current and target data assets, actors, and trust boundaries are inventoried | Pass | `data-classification.md` |
| Regression surface, test environments, risks, and evidence policy are documented | Pass | `quality-strategy.md` |
| Personal, guest, public-share, and collaboration boundaries are consistent | Pass | All Day 1 artifacts |
| Technical Lead review | Pass | Architecture conclusion above |
| Security review | Pass | Security conclusion above |
| Senior QA review | Pass | QA conclusion above |
| UX state inventory review | Pass for discovery | UX conclusion above |
| Product Owner confirms target users, initial scale, scope, and non-goals | Pass | Approved on 2026-07-15 |

## 7. Gate decision

Final squad decision: **GO**.

The Product Owner approved the Day 1 product boundary on 2026-07-15. Day 2 may proceed. Phase 1 implementation remains prohibited until the full Phase 0 exit gate passes.

## 8. Product Owner confirmation

The Product Owner is asked to confirm the following statement:

> Collaboration Foundation targets small internal QA/product teams. It adds authenticated, encrypted, revision-safe workspaces while retaining Personal Vault as a separate mode. Realtime co-editing, comments, attachments, shared credentials, public workspaces, organization hierarchy, and automatic personal-data migration are outside Foundation.

- [x] Product Owner confirmed the statement above on 2026-07-15.
- [x] Gate G0 is Passed.
