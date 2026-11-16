# OpenTime: Development Plan

This plan builds OpenTime in vertical slices. Each checkpoint should be a deployed version that someone can use end to end, not a set of disconnected backend pieces. The order follows the core user journey: join a group, share openings, see overlaps, then turn an overlap into a confirmed gathering. We will conduct user testing at every development stage, use what we learn to guide the next stage, and complete a final round of end-to-end user testing before the final demo.

## 1. Timeline

| Date | Stage | What we expect to deliver |
| --- | --- | --- |
| Nov 16 | **F3: Concept design** | Final concept specifications and reactions, user journey, visual design study, design summary, and this plan. |
| Nov 17–19 | Setup | Repository structure, database, sync engine wiring, and a deployment pipeline. Each concept gets a stub with its actions and queries, and the team agrees on API routes and request/response shapes. |
| Nov 23 | **Checkpoint 1: Alpha** | A deployed app covering the first half of the journey. Users can register, sign in, and sign out (Authenticating). They can create a group, invite members individually, accept or decline invitations, and join through a shared group link after signing in (Grouping). They can create, publish, revise, and withdraw dated openings (AvailabilitySharing). They can view their group's overlaps as a simple list or day view. The UI is functional and only lightly styled. We will run user tests on these flows and prioritize the findings for Beta. |
| Nov 30 | **Checkpoint 2: Beta** | The full core journey. An organizer proposes a gathering from an overlap, invitees accept or decline, the organizer confirms, and more people can be invited after confirmation (Gathering). Editing creates a new version requiring fresh acceptance and confirmation. Attendees can withdraw, and the organizer can cancel. If the last non-organizer attendee withdraws and no invitations remain pending, the gathering closes automatically. Conflicts with confirmed gatherings are checked. In-app notices cover the invitations, responses, edits, confirmation, withdrawal, and cancellation specified in the essential reactions (Notifying). The visual design study is applied across the app. We will test the complete journey with users and use the findings for final refinements. |
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

## 3. Key Risks and Mitigations

| Risk | Why it matters | Mitigation | Fallback |
| --- | --- | --- | --- |
| **Gathering is too complex to finish by Beta** | Gathering is the heart of the app and our largest concept. Versioning, fresh acceptance after edits, automatic closure, and conflict checks all interact, and Beta falls right after Thanksgiving. | Build the simplest lifecycle first (propose, accept, decline, confirm, cancel), then add `invite`, `withdraw`, and finally `edit`. Write tests from the spec before connecting the UI. | Treat an edit as "cancel and re-propose to the same invitees." This keeps the rule that a changed plan needs fresh acceptance, without storing version history. |
| **Overlaps reveal people's private openings** | Our privacy commitment ([ethical analysis](problem-framing.md#ethical-analysis)) is that members see only shared overlaps, never someone's individual openings. Computing overlaps in the browser from raw openings would break this. | Compute overlaps only on the server, inside the reaction that checks group membership. Responses contain overlap intervals, not other people's openings. Add tests checking that no other member's opening appears in any response. | Limit overlap searches to a single selected day and use a simple server-side list view. Defer longer-range searches and interactive calendar views. Keep the same membership checks and return only overlap intervals. No fallback exposes other users' raw openings. |
| **We can't test the core idea with real groups** | OpenTime only works when several people in the same group keep their openings up to date. Testing with individuals won't tell us whether the app actually helps friends meet, which is the main assumption our problem framing says we must test. | Recruit three real friend groups before Beta, such as a dorm floor, a sports team, and a study group. In the first session, have each group add a week of openings together so the app isn't empty. | Run moderated sessions in which team members play the other group members, and report this limitation honestly in the testing results. |

## 4. Priority Order If Time Runs Short

When we have to cut scope, we protect the core journey and cut in this order, first item first:

1. Stretch goals: willingness levels and activity suggestions.
2. Richer calendar interaction and longer-range overlap searches. Instead, retain a simple view for a selected day.
3. Gathering version history, using the documented fallback of cancelling and re-proposing with fresh acceptance.
4. Visual polish beyond the design study's typography, color, and layout basics.

We retain consensual membership, private openings, server-computed overlaps, explicit acceptance and confirmation, and notices of invitations, edits, confirmation, withdrawal, and cancellation.

If we adopt a fallback, we update the affected concept specifications, reactions, user journey, and design summary to describe the behavior we will actually deliver.
