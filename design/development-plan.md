# OpenTime: Development Plan

This plan builds OpenTime in vertical slices. Each checkpoint should be a deployed version that someone can use end to end, not a set of disconnected backend pieces. The order follows the core user journey: join a group, share openings, see overlaps, then turn an overlap into a confirmed gathering. We will conduct user testing at every development stage, use what we learn to guide the next stage, and complete a final round of end-to-end user testing before the final demo.

**November 18 scope decision:** The team agreed to target the entire [core user journey](core-user-journey.md) for the November 23 Alpha. This includes proposing and confirming a gathering, editing it into a new version, obtaining fresh responses and reconfirming, Noah's late acceptance, and the in-app notices needed for those steps. This moves part of Gathering and Notifying forward from the original Beta plan. The F4 submission must describe the behavior actually delivered.

## 1. Timeline

| Date | Stage | What we expect to deliver |
| --- | --- | --- |
| Nov 16 | **F3: Concept design** | Final concept specifications and reactions, user journey, visual design study, design summary, and this plan. |
| Nov 18–19 | Setup and contracts | Adapt the course Sync Engine setup to this existing repository. Wire Bun, TypeScript, the matching Sync Engine HTTP adapter, MongoDB, and Vue/Vite. Agree on shared contracts and run one persisted UI-to-API slice plus a production preview. |
| Nov 20 | Membership and openings slice | Separate accounts can register and sign in, create and join a group, publish dated openings, and see only authorized common intervals. Begin deploying this integrated slice. |
| Nov 21 | First confirmation slice | John proposes from an overlap; Walker and Eli explicitly accept; Noah stays pending; John confirms the exact accepted roster. Stale rosters and conflicts cannot confirm. |
| Nov 22 | Full journey release candidate | Editing releases old commitments and creates a new version; invitees respond again; John reconfirms; Noah later accepts the confirmed version. The necessary in-app notices and Vue screens work. Freeze a reviewed commit for deployment and testing. |
| Nov 23 | **Checkpoint 1: Alpha** | A public deployed app demonstrating the complete core journey with real accounts and persistent data. Also deliver the previously planned sign-out, named and link-based group joins, opening revision/withdrawal, updated F3 designs and progress plan, and a narrated recording. Report any incomplete target honestly. |
| Nov 30 | **Checkpoint 2: Beta** | Complete the remaining specified actions and harden the app: group departure/removal/closure, additional gathering invitations, withdrawal/cancellation and automatic closure, full notice coverage, and UI improvements from Alpha testing. Revisit this list if Alpha scope changes. |
| Dec 1–7 | Final user testing and refinement | At least three real friend groups use the complete app for planning. We watch where people hesitate, note any confusion between being open and being committed, and fix the most important problems we find. After those fixes, we will run a final end-to-end validation round to confirm that the core journey works for users. |
| Dec 9 | **Final demo** | UI polish, bug fixes, empty and error states, final documentation (README, updated design docs, testing report), and a rehearsed demo informed by the results of the final user-testing round. |

**Stretch goals** come from our ethical analysis and are attempted only after Beta is stable:

- Levels of willingness on openings, such as "would love to" versus "could be convinced" (Insight 3)
- Optional activity suggestions for an overlap (Insight 4)

Shareable group invitation links are part of the core Grouping design and are scheduled for Alpha. They require an account, but registration-free guest participation remains a possible future extension rather than an MVP commitment.

## 2. Team Responsibilities

Each person owns concepts from backend to frontend. The owner builds the concept, writes its tests, writes the reactions that change its state, and builds the screens for it. Authenticating and Notifying are the simplest concepts, so one person owns both. Each of the other three concepts has its own owner. Areas are paired so each one has a second person who reviews its pull requests.

| Member | Primary ownership | Reviews |
| --- | --- | --- |
| Varun | Grouping: group creation, individual invitations, shared join links, accepting and declining, leaving, removal, and closure. Owns membership screens and the membership checks other reactions rely on. Also owns the frontend shell (shared layout, navigation, and design system from the visual study). | Anthony |
| Anthony | AvailabilitySharing: the openings editor, publishing to groups, the overlap calculation (`_sharedWith` across members), and the group overlap view. | Varun |
| Wyatt | Gathering: proposals, versioning, accept/decline/confirm, withdraw/cancel, the conflict checks against confirmed gatherings, and the gathering detail page. Also owns deployment and the database. | Desire |
| Desire | Authenticating and Notifying: registration, sign-in/sign-out, request authentication, the notice inbox, and all notification reactions. Also coordinates user testing. | Wyatt |
| Everyone | Integration testing at each checkpoint, user testing sessions, documentation, and the final demo. | — |

**Working agreement for the build:**

- We meet weekly with our mentor during Wednesday lecture time and post a short async update in the team chat twice a week.
- Every change goes through a pull request with one reviewer.
- A checkpoint branch is frozen the evening before each deadline so we can test the deployed version together.
- At every development stage, we test the current user-facing slice with representative users, record what we learn, and use the highest-priority findings to plan the next stage. We also conduct a final end-to-end user test after the last fixes and before the final demo.

## 3. Alpha Execution and Evidence

**Architecture and contracts.** The backend uses Sync Engine for concepts and reactions, its matching HTTP adapter for `/api`, and MongoDB for each concept's persistent state. The frontend uses Vue and Vite with the generated typed API client. Convert the existing specifications into Sync Engine's expected design files without losing the readable [concept design](concept-design.md). Before parallel implementation, agree on opaque IDs, request and response shapes, session transport, error codes, and absolute time representation. Regenerate contracts and run design checks after every interface change. Concepts do not read one another's state; reactions authenticate each request, check roles, and coordinate them. Internal queries do not become public endpoints.

**First working path.** The first slice must send a real request from Vue through the Sync Engine HTTP boundary, persist a record in MongoDB, return a typed response, and show it without a manual page reload. Build the next slices through the same path: authentication and membership; private openings and server-computed overlap with partial-group suggestions when no complete-group time exists; proposal, responses, and confirmation; edit, fresh responses, reconfirmation, and late acceptance; then notices and polish. The Vue navigation should follow user tasks rather than expose the backend concept structure. Every slice includes loading, empty, success, and actionable error states.

**Gathering integrity.** Alpha checks the displayed version, exact accepted roster, and conflicting commitments before a conditional update to one gathering document. A single app process serializes these changes; the cross-instance concurrency guarantee is deferred to Beta with TA guidance. Test competing confirmations in the supported Alpha setup. Editing a confirmed gathering releases old commitments and requires fresh acceptance of its new version. Accepting a current confirmed version before it starts joins the roster only if the conflict check succeeds.

**Checks.** Run Sync Engine design and application checks, generated-artifact checks, TypeScript checks, Vue build, and focused concept tests after each slice. Set up test state through concept actions. Exercise the John/Walker/Eli/Noah flow through the UI with separate accounts and real persistence. Verify a pending group invitee cannot view overlaps, another member cannot retrieve private openings, an absent opening prevents a full-group overlap, silence remains pending, an outsider cannot read gathering details, stale version or roster requests fail, and adjacent and expired intervals behave as specified. Check that confirmation removes committed time from overlap and editing releases it. Save results and describe any gaps.

## 4. Key Risks and Mitigations

| Risk | Why it matters | Mitigation | Fallback |
| --- | --- | --- | --- |
| **The full journey is too complex to finish by Alpha** | Versioning, fresh acceptance, confirmation, late joins, notices, and conflict checks interact, while F4 is due November 23. | Build and deploy the vertical slices above; pair on cross-concept reactions; target a reviewed release candidate on November 22. | If the team changes scope, update the concept design, reactions, user journey, design summary, and this plan to match the real behavior, then report the limitation in the recording and submission. Do not simulate a completed journey. |
| **Concurrent confirmations create conflicting attendance** | Two organizers could read the same availability and both confirm a shared attendee. | Decide and test an atomic persistence strategy before the confirmation UI depends on it. | No fallback may silently create two overlapping confirmed commitments. |
| **Deployment access or packaging delays** | F4 requires a public URL and a successful local run does not prove the deployed app works. | Verify platform access early, test production preview, deploy an integrated slice before the final day, and smoke-test the release commit. | If access is missing, contact course staff promptly and record the blocker; local-only is not considered deployed. |
| **Overlaps reveal people's private openings** | Our privacy commitment ([ethical analysis](problem-framing.md#ethical-analysis)) is that members see only shared overlaps, never someone's individual openings. Computing overlaps in the browser from raw openings would break this. | Compute overlaps only on the server, inside the reaction that checks group membership. Responses contain aggregate intervals and, for partial suggestions, unavailable members' names; they never contain raw openings. Add tests checking that no other member's opening appears in any response. | Limit overlap searches to a single selected day and use a simple server-side list view. Defer longer-range searches and interactive calendar views. Keep the same membership checks and return only overlap intervals. No fallback exposes other users' raw openings. |
| **We can't test the core idea with real groups** | OpenTime only works when several people in the same group keep their openings up to date. Testing with individuals won't tell us whether the app actually helps friends meet, which is the main assumption our problem framing says we must test. | Recruit three real friend groups before Beta, such as a dorm floor, a sports team, and a study group. In the first session, have each group add a week of openings together so the app isn't empty. | Run moderated sessions in which team members play the other group members, and report this limitation honestly in the testing results. |

## 5. Priority Order If Time Runs Short

When we have to cut scope, we protect the core journey and cut in this order, first item first:

1. Stretch goals: willingness levels and activity suggestions.
2. Richer calendar interaction and longer-range overlap searches. Instead, retain a simple view for a selected day.
3. Additional Grouping and Gathering controls outside the core journey, after the previously promised Alpha flows are reviewed explicitly with the team.
4. Visual polish beyond the design study's typography, color, and layout basics.

We protect consensual membership, private openings, server-computed overlaps, explicit version-aware acceptance and confirmation, and the notices needed for the Alpha journey. Remaining notice triggers for later actions are in Beta unless those actions move forward.

If we adopt a fallback, we update the affected concept specifications, reactions, user journey, and design summary to describe the behavior we will actually deliver.

## 6. Progress on November 18

The Bun, Sync Engine, HTTP adapter, MongoDB, and Vue/Vite foundation is running locally. Authenticating is the first implemented concept: registration, sign-in, current-account lookup, and sign-out work through the Vue UI, generated HTTP client, Sync Engine composition, and persistent MongoDB state. Browser sessions use the documented HttpOnly cookie. The design and generated-contract checks, TypeScript checks, Vue build, three account integration tests, and a browser sign-in/reload/sign-out walkthrough passed. The browser walkthrough used a disposable account in the guarded test database, which the test suite cleared afterward.

The Grouping slice provided authenticated creation, named invitations, acceptance and decline, explicit link joining, member departure, owner removal and closure, and a requester-scoped group list. Integration tests exercised membership transitions and link reuse after removal. AvailabilitySharing provided private dated openings, selected-group publication, revision, withdrawal, and member-only full-group overlap search. The initial design used exact purpose matching; on November 19 the team simplified openings to purpose-free availability and moved purpose to Gathering proposals. Search duration remains in minutes, one owner's openings cannot overlap, and confirmed commitments mask overlap results. Tests cover privacy, concurrent creation, revision, withdrawal, and revoked membership.

## 7. Progress and Remaining Alpha Work on November 19

The Gathering actions are implemented locally: current group members can be invited initially or later, proposals preserve the organizer's acceptance and others' pending responses, invitees can accept or decline, and the organizer confirms the exact accepted roster. Editing preserves past versions, releases old commitments, and requires fresh responses before reconfirmation. A late acceptance joins a confirmed gathering immediately. Accepted invitees can withdraw and organizers can cancel; the last non-organizer withdrawal closes a confirmed gathering when no response remains pending. Confirmed attendee intervals mask group overlaps. Shared MongoDB transaction writes serialize conflicting confirmations and late joins. The Notifying inbox and notices for group invitations and all Gathering actions are implemented locally. Each domain action commits an outbox event with its state change; a worker retries delivery, and recipient plus source key deduplicates notices. Local MongoDB runs as an authenticated single-node replica set. The hosted 6.1040 Apps MongoDB transaction capability has not yet been verified.

Overlap reads now use a single MongoDB snapshot for membership, shared openings, commitments, and display names. A failed snapshot produces a retry error. When no full-group interval exists, search suggests intervals for the largest available subset of at least two members and names unavailable members. Integration tests cover partial and full-group results and a concurrent opening withdrawal during a snapshot read. A browser walkthrough verified four disposable users joining one group; the remainder of their gathering journey still needs a UI walkthrough.

The deployment preflight now checks snapshot transaction support before the backend starts. The local production preview builds and serves `/health`, the home page, and gathering deep links. The team created the `opentime` app in 6.1040 Apps and configured its MongoDB connection variable, but the platform still shows "Not deployed"; hosted transaction support and a release have not yet been verified. `PUBLIC_ORIGIN` was added in platform settings; its saved value still needs checking against the public app URL.

On November 19, the design form check, Sync Engine application and generated-artifact checks, backend and Vue type checks, and production build passed. All 22 MongoDB-backed tests passed, including full and partial overlap, privacy, the four-person confirmation flow, edit and fresh responses, reconfirmation, late acceptance, notices, and conflicting commitments. A local production smoke check returned HTTP 200 for `/health`, `/`, and a gathering deep link. This evidence covers the backend boundary and production serving; it does not replace a four-person browser walkthrough or a deployed smoke test. The personal warning for a confirmed gathering outside someone's revised openings is deferred until after Alpha by team decision.

The overlap screen now clears its results when group, range, or duration changes, so an old interval cannot be proposed against different search criteria.

Remaining before the first Alpha checkpoint:

1. Complete the John/Walker/Eli/Noah journey through the browser, including the edit confirmation and notices; inspect responsive layout and the most important error states. The automated boundary tests already cover privacy, stale versions and rosters, concurrent conflicts, and changed commitments.
2. Verify transactions on the course-hosted MongoDB, check the saved `PUBLIC_ORIGIN`, deploy a reviewed commit to 6.1040 Apps, and smoke-test the public URL, production health check, and notice worker.
3. Conduct representative user testing, make the highest-priority fixes, update the F3 design and progress evidence to match delivered behavior, and record the narrated F4 demonstration.

## 8. Alpha release status

Selected-member search and live confirmation review are implemented locally. Design and type checks, the production build, and all 123 tests passed. The selected-search regression test verifies that private openings and removed members cannot contribute to results and that confirmed commitments mask shared time.

A local browser walkthrough verified no-match recovery, proposal handoff, and confirmation persistence. When a second invitee accepted through the local API during review, the organizer's browser showed the updated roster and required another review. After confirmation, the interval no longer appeared in the selected search.

Before submission, deploy the reviewed commit, check the flow at phone width, and record the narrated walkthrough on the public build. Link the recording in the README and submit it with the public URL and commit SHA.

## 9. November 22 Alpha database decision

The course MongoDB does not support transactions. Alpha now uses conditional single-document writes and serializes Gathering changes within one app process. Grouping and Gathering keep pending notice events in their own documents for retry; overlap and calendar reads are sequential and may become stale during a concurrent change. This preserves the ordinary core journey on standalone MongoDB, but multiple app instances cannot guarantee exclusion of simultaneous conflicting commitments. Revisit that guarantee with the TA for Beta. This update supersedes the transaction and snapshot requirements described in the November 19 progress record above.

The current gate is a reviewed deployment on the course platform, followed by a public four-person journey, mobile check, updated evidence, and narrated recording.
