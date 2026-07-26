# CF-EV-P7-OPS-004 Qualifying CF-P7-013 against the post-D-P7-01 Preview build

Status: **PARTIAL** — the lazy boundary, the artifact, and the deployment verdict
are proven on the deployment; no journey is qualified, and one declared budget is
measured for the first time and **fails**

Story: `CF-P7-013`, under `P7-G4` authorized by the owner on 2026-07-26

## A note on the file name

This evidence was commissioned as `CF-EV-P7-OPS-002.md`. That identifier is
already taken by a committed record (`60fba01`) of a **different** deployment,
`4c5d7c8a` from `fe0fa2e`, and [`CF-EV-P7-OPS-003`](CF-EV-P7-OPS-003.md) cites it
by name as "the deployment this story was measured against". Writing over it
would have put two different deployments behind one identifier and silently
broken that citation, so this takes the next free number instead. Nothing was
overwritten and nothing was deleted.

## Deployment

Identity was read from the Pages API, not assumed from the URL.

| Field | Value |
|---|---|
| Project | `docvault-qa-document-hub` |
| Environment | Preview |
| Branch | `codex-cf-p3-preview` |
| Deployment | `681ad3ca-f0f7-4f66-8649-c7dab3de798d` |
| Source commit | `d4d9ea6` |
| Direct URL | `https://681ad3ca.docvault-qa-document-hub.pages.dev` |
| Branch alias | `https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev` |
| Identity confirmed by | `npx wrangler pages deployment list --project-name docvault-qa-document-hub` |
| Measured | 2026-07-26, 17:46–17:53 UTC |
| Local tree at measurement | `d4d9ea6`, clean — the same commit the deployment was built from |

The branch alias was measured alongside the direct URL throughout and answered
identically, so nothing below is a stale-alias artifact.

## 1. The lazy budget

### Nothing under `js/collaboration/` is referenced eagerly

| Measurement | Result |
|---|---|
| `<script>` elements in the served `index.html` | 22 |
| …whose `src` is under `js/collaboration/` | **0** |
| Service worker `APP_SHELL` precache entries (served `sw.js`) | 37 |
| …under `js/collaboration/` | **0** |
| Occurrences of the string `collaboration` in the served `sw.js` | **0** |

`index.html` mentions `js/collaboration/entry.js` exactly once, inside an HTML
comment explaining that the opener's click handler is what imports it. It is not
a script tag and the browser never fetches it on that basis.

### Confirmed in a real browser on the deployment, not inferred from the source

Loaded signed-out, opener untouched:

| Measurement | Result |
|---|---|
| Resources fetched under `/js/collaboration/` before the opener is pressed | **0** |
| Total resources fetched | 34 |
| `#collaboration-root` | present, `hidden`, 0 children |
| Console errors | none |

Then, on the branch-alias origin, the cache storage and the service worker
registration were **cleared** and the page reloaded, to get a precache reading
uncontaminated by earlier sessions:

| Measurement | Result |
|---|---|
| Entries in `docvault-shell-v45` after a clean install | 37 — exactly `APP_SHELL` |
| …under `js/collaboration/` | **0** |

That clearing step mattered. Before it, the same cache on that origin held 45
entries including `entry.js` and `shell.js`, left behind by an earlier visit;
read naively it looks like a precache violation and is not one.

### One thing a later reader will misread, recorded so they do not

After the opener is pressed, the shell cache on the direct-URL origin holds
**20** `js/collaboration/` entries. Those are not precached. `sw.js` is
network-first with a write-through: every successful same-origin GET is copied
into the same cache the precache lives in. A visitor who never presses the opener
fetches nothing and therefore caches nothing, which is what the clean-install
measurement above shows. The budget holds; the cache is simply not a safe place
to read the budget from.

### The budget that fails

`config/cloudflare/phase-7-sprint-plan.json:342` declares
`"lazy_phase_7_chunk_max_kib_gzip": 60`. Measured on the deployment, as
Cloudflare actually serves it, over the 20 modules the entry really pulls:

| Encoding requested | Wire bytes | KiB | Against the 60 KiB budget |
|---|---|---|---|
| `gzip` | 80,249 | **78.4** | **over by 18.4 KiB (+31%)** |
| `br` | 82,623 | 80.7 | over |
| `identity` | 256,164 | 250.2 | n/a |

The budget is stated in gzip, so the gzip row governs. It fails under the
narrower reading too: excluding the three inherited Phase 5/6 service modules the
lazy path also pulls (`device-key-lifecycle.js` 5,212 B, `outbox.js` 5,457 B,
`conflict-resolution.js` 3,708 B), the seventeen Phase 7 modules alone come to
65,872 B = **64.3 KiB gzip**, still over 60. There is no definition of "the
Phase 7 chunk" under which this passes.

Per-module gzip wire bytes:

| Module | gzip B | Module | gzip B |
|---|---|---|---|
| `api-client.js` | 7,390 | `invitations.js` | 4,473 |
| `entry.js` | 7,036 | `invitation-accept.js` | 4,116 |
| `create-workspace.js` | 6,322 | `member-list.js` | 4,104 |
| `device-initialization.js` | 5,549 | `conflict-resolution.js` | 3,708 |
| `outbox.js` | 5,457 | `conflict-dialog.js` | 3,466 |
| `device-key-lifecycle.js` | 5,212 | `surface-panel.js` | 3,253 |
| `services.js` | 4,475 | `audit-activity.js` | 3,000 |
| `sync-state.js` | 2,960 | `workspace-switcher.js` | 2,241 |
| `workspace-context.js` | 2,052 | `account-menu.js` | 1,952 |
| `base-states.js` | 1,808 | `shell.js` | 1,675 |

**No gate measures this.** `lazy_phase_7_chunk_max_kib_gzip` is declared in the
sprint-plan config and read by nothing — no script under `scripts/` computes a
byte size of any collaboration module. [`CF-EV-P7-PERF-001`](CF-EV-P7-PERF-001.md)
deferred the measurement to CF-P7-013 in as many words, and this is it. The
number was therefore never wrong; it was never checked. It is checked now, and it
does not hold.

There is no bundling or minification step: the twenty modules are served as
twenty separate source files, comments included. That is the cost, not an
accident of measurement.

## 2. The artifact — every module under `js/collaboration/`

All 22 modules present at `d4d9ea6` were requested on the deployment.

| Module | Status | `content-type` | Bytes |
|---|---|---|---|
| `account-menu.js` | 200 | `application/javascript` | 5,470 |
| `api-client.js` | 200 | `application/javascript` | 21,961 |
| `audit-activity.js` | 200 | `application/javascript` | 9,229 |
| `base-states.js` | 200 | `application/javascript` | 4,817 |
| `conflict-dialog.js` | 200 | `application/javascript` | 10,638 |
| `conflict-resolution.js` | 200 | `application/javascript` | 11,559 |
| `create-workspace.js` | 200 | `application/javascript` | 20,275 |
| `device-initialization.js` | 200 | `application/javascript` | 18,565 |
| `device-key-lifecycle.js` | 200 | `application/javascript` | 22,162 |
| **`document-envelope.js`** | 200 | **`text/html; charset=utf-8`** | **43,473** |
| `entry.js` | 200 | `application/javascript` | 21,001 |
| `invitation-accept.js` | 200 | `application/javascript` | 12,966 |
| `invitations.js` | 200 | `application/javascript` | 14,930 |
| `member-list.js` | 200 | `application/javascript` | 14,275 |
| `outbox.js` | 200 | `application/javascript` | 18,692 |
| `services.js` | 200 | `application/javascript` | 14,102 |
| `shell.js` | 200 | `application/javascript` | 4,273 |
| **`storage-provider.js`** | 200 | **`text/html; charset=utf-8`** | **43,473** |
| `surface-panel.js` | 200 | `application/javascript` | 10,174 |
| `sync-state.js` | 200 | `application/javascript` | 8,122 |
| `workspace-context.js` | 200 | `application/javascript` | 5,581 |
| `workspace-switcher.js` | 200 | `application/javascript` | 7,372 |

**20 of 22 are real modules. Two are the SPA fallback** — 43,473 bytes each,
byte-for-byte the length of `GET /`, and their bodies begin `<!DOCTYPE html>`.
This is the exact signature of the defect deployment `037fb093` shipped and
[`CF-EV-P7-OPS-001`](CF-EV-P7-OPS-001.md) recorded.

### It is not a recurrence, and here is the measurement that shows it

Three independent facts, none of them an assumption:

1. Pressing the opener on the deployment fetched **exactly 20** modules — the
   complete set above minus those two. Neither file is requested by the running
   application, so neither can fail to load.
2. Nothing under `js/` imports either module. Their only importers are Node
   tests and gate scripts.
3. The exclusion is asserted deliberately.
   `tests/cloudflare-phase-7-api-client-policy.test.mjs:574` reads
   `assert.equal(closure.has('js/collaboration/storage-provider.js'), false);`
   under a test named *the import closure follows the entry rather than the
   directory*. The build ships the entry's transitive closure, not the folder.

So the artifact is correct: these are Phase 5/6 service modules that no Phase 7
surface reaches yet, and the build reflects that faithfully.

**The caveat is worth more than the clearance.** "Correctly excluded" and
"missing" are the same 200-with-`text/html` on the wire. The only thing that
distinguishes them is whether something imports the file — which is a property of
the *next* commit, not this one. The first Phase 7 surface to import
`document-envelope.js` or `storage-provider.js` gets a working local build and a
broken deployment, and the content-type is the only place it shows. Nothing
currently gates that transition.

## 3. The deployment verdict

`GET /api/v1/session`:

| Field | Value |
|---|---|
| Status | **503 Service Unavailable** |
| `content-type` | `application/json; charset=utf-8` |
| Body | `{"error":{"code":"COLLABORATION_UNAVAILABLE","message":"Collaboration is currently unavailable."},"meta":{"requestId":"req_088470e9-9e3d-4ce4-9eb6-f1388d2db914","apiVersion":"v1"}}` |
| `X-Request-ID` | `req_088470e9-9e3d-4ce4-9eb6-f1388d2db914` |

`GET /api/v1/workspaces` answers the same code, and the branch alias answers the
same on both routes. **Collaboration is off on this build**, notwithstanding that
`d4d9ea6` executed D-P7-01 across the repository. Pages binds environment
variables at build time; the repository change cannot reach a build that was
produced without the variable set.

### What a signed-out visitor is therefore shown

Measured by pressing the opener in a real browser on the deployment. Not derived
from reading the source.

| Measurement | Result |
|---|---|
| API requests the entry made | **1** — `/api/v1/session` → 503, and it stopped there |
| Rendered state | `error` |
| Title | "Collaboration is not enabled here" |
| Reason | "Team collaboration is not enabled on this deployment." |
| Interactive controls offered in the shell | **0** — no button, link, or input |
| Console errors | none |

Served markup, verbatim:

```html
<div class="collab-state collab-state--error" data-collab-state="error"
     data-collab-surface="base-states" data-shape="triangle"
     role="status" aria-live="assertive">
  <span class="collab-state__shape collab-state__shape--triangle" aria-hidden="true"></span>
  <p class="collab-state__title">Collaboration is not enabled here</p>
  <p class="collab-state__reason">Team collaboration is not enabled on this deployment.</p>
</div>
```

Two things in that are worth keeping. The single request is the fail-closed
ordering working: availability is decided before anything else is asked, so a
disabled deployment is never probed further. And the zero interactive controls
mean a visitor is told the feature is off rather than offered a sign-in that
cannot succeed. The state carries a non-colour shape token and an assertive live
region, so the message is not signalled by colour alone.

## 4. Response headers on `/`

Verbatim, as served.

| Header | Value |
|---|---|
| `content-security-policy` | `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; script-src-elem 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https:; worker-src 'self'; manifest-src 'self'; frame-src 'none'; upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Cache-Control` | `public, max-age=0, must-revalidate` |

Recorded alongside, because they differ from the document response and the
difference is deliberate — the API is tighter on both counts:

| Header on `/api/v1/session` | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'none'; base-uri 'none'; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Cache-Control` | `no-store, private` |
| `Pragma` / `Expires` | `no-cache` / `0` |
| `Referrer-Policy` | `no-referrer` |

Also present on `/`: `x-content-type-options: nosniff`,
`x-frame-options: DENY`, `cross-origin-opener-policy: same-origin`,
`referrer-policy: strict-origin-when-cross-origin`, `x-robots-tag: noindex`, and
a `permissions-policy` denying accelerometer, camera, geolocation, gyroscope,
magnetometer, microphone, payment, and usb.

HSTS lacks `preload` on both. Recorded as an observation, not a finding — no
Phase 7 requirement asks for it.

## 5. The availability banner

**Present and hidden**, as CF-P7-002 requires of a Cloudflare origin.

| Measurement | Result |
|---|---|
| `#collaboration-availability-banner` in the served HTML | present |
| `hidden` attribute in the served HTML | yes |
| `hidden` in the live document, after load | `true` |
| Computed `display` | `none` |
| `hidden` after the opener was pressed and the 503 rendered | still `true` |
| `#collaboration-open` `hidden` in the served HTML | yes |
| `#collaboration-open` `hidden` in the live document | `false` — revealed by `js/deployment.js` |

Both halves of surface 12 behave: the banner ships hidden and stays hidden here,
because this *is* the Cloudflare deployment, while the opener ships hidden and is
revealed. The banner staying hidden on a deployment whose API says 503 is correct
and not a contradiction — the banner's claim is "collaboration is Cloudflare-only",
which is about *where* you are, and the 503's claim is "it is switched off here",
which the shell states in its own words.

## Qualification verdict

**PARTIAL.** CF-P7-013 is **not PASS**.

| Item | Verdict |
|---|---|
| 1. Lazy budget — zero eager references, zero precached | **PASS** |
| 1b. Lazy chunk ≤ 60 KiB gzip | **FAIL** — 78.4 KiB measured |
| 2. Artifact — every module resolves | **PASS with a caveat**, 20 of 22 shipped and the 2 absentees are outside the entry's closure by design |
| 3. Deployment verdict and signed-out experience | **Measured** — 503, and the shell states it correctly |
| 4. Response headers on `/` | **Recorded** |
| 5. Availability banner present and hidden | **PASS** |
| Journeys | **NOT MEASURED** |

No journey was attempted and none is reported. `/api/v1/session` answers 503, so
there is no session, no workspace, no member, no invitation, and no audit event
to qualify against. Inventing any of those results would be the only way to make
this look finished, so none of them appears above.

## Not evidenced

**(a) Every journey.** Create workspace, device and key initialization, member
list, invitation creation and acceptance, sync state, conflict resolution, audit
activity, and sign-in itself. All ten journey surfaces are present in the
artifact and none can be exercised against a deployment answering 503. Gate
criteria U2, U3 and U4 depend on a live workspace and are therefore not measured
here.

**(b) Responsive layout and horizontal scroll (U6).** The browser pane reported
`clientWidth: 0` and `innerWidth: 0` both before and after an explicit resize to
the desktop preset, so `scrollWidth > clientWidth` evaluated `true` against a
zero-width viewport. That is an instrumentation artifact, not a measurement. No
horizontal-scroll, layout, or 320 px claim is made from this session. The
existing local qualification in
[`CF-EV-P7-OPS-003`](CF-EV-P7-OPS-003.md) stands unaffected and unconfirmed by
the deployment.

**(c) Keyboard, focus, and contrast (U5).** The only surface that rendered is a
non-interactive error state with zero focusable controls. There was nothing to
tab through, so nothing was measured.

**(d) Why collaboration is off.** Whether `COLLABORATION_ENABLED` is unset, set
to a value other than `true`, or was set *after* this build began cannot be
distinguished from the outside: all three produce an identical 503, and wrangler
exposes no read path for Pages environment variables. Deployment *behaviour* was
measured; the Pages project variable was not. "The variable is not set" is an
inference and is deliberately not recorded here as a fact.

**(e) Production's collaboration state.** Not probed in this task. Production
`94d87e14` was built from the same `d4d9ea6` and appears in the deployment list,
but the Phase 7 boundary "no collaboration activation in production" is neither
confirmed nor refuted by anything measured above.

**(f) Compression figures are the CDN's, not a build artifact.** The gzip and
brotli numbers are Cloudflare's dynamic compression of unbundled, unminified
source. A build step that bundled or stripped comments would change them. The
budget breach is real at the current shipping configuration and is stated about
that configuration.

## What would make this PASS

1. `COLLABORATION_ENABLED` set for the **Preview environment** of the Pages
   project, then `codex-cf-p3-preview` **rebuilt** — a new deployment id, not a
   re-measurement of `681ad3ca`. Pages binds environment variables at build time,
   so a build produced before the variable existed can never carry it, which is
   precisely what the zero delta between `4c5d7c8a` and `681ad3ca` demonstrates.
   This is an owner action: `wrangler pages secret put` is refused to an agent by
   the permission classifier. Already on record at
   `config/cloudflare/phase-7-preview-integration.json:76`.
2. The journeys qualified against the resulting deployment.
3. The 60 KiB lazy budget either met or renegotiated on the record — and, either
   way, given a gate that measures it, since the current gap is that no check
   reads the number at all.

Until then `P7-G4A` is not reached and `CF-P7-014` is not authorized to begin.

## Boundary

Read-only against a Preview deployment. No write request was issued, no database
was touched, no secret was read or set, no credential was entered, and no
authenticated session was obtained or attempted. The only state changed anywhere
was the measuring browser's own cache storage and service worker registration on
the branch-alias origin, cleared deliberately to obtain an uncontaminated
precache reading; both rebuild themselves on the next visit. No commit was made.
