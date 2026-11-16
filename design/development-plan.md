# OpenTime: Development Plan

This plan builds OpenTime in vertical slices. Each checkpoint should be a deployed version that someone can use end to end, not a set of disconnected backend pieces. The order follows the core user journey: join a group, share openings, see overlaps, then turn an overlap into a confirmed gathering.

## 1. Timeline

| Date | Stage | What we expect to deliver |
| --- | --- | --- |
| Nov 16 | **F3: Concept design** | Final concept specifications and reactions, user journey, visual design study, design summary, and this plan. |
| Nov 17–19 | Setup | Repository structure, database, sync engine wiring, and a deployment pipeline. Each concept gets a stub with its actions and queries, and the team agrees on API routes and request/response shapes. |
| Nov 23 | **Checkpoint 1: Alpha** | A deployed app covering the first half of the journey. Users can register, sign in, and sign out (Authenticating). They can create a group, invite members, and accept or decline (Grouping). They can create, publish, revise, and withdraw dated openings (AvailabilitySharing). They can view their group's overlaps as a simple list or day view. The UI is functional and only lightly styled. |
| Nov 30 | **Checkpoint 2: Beta** | The full core journey. An organizer proposes a gathering from an overlap, invitees accept or decline, the organizer confirms, and more people can be invited after confirmation (Gathering). Editing creates a new version that needs fresh acceptance; attendees can withdraw and the organizer can cancel. Conflicts with confirmed gatherings are checked. Every essential reaction produces an in-app notice (Notifying). The visual design study is applied across the app. |
| Dec 1–7 | User testing | At least three real friend groups use the app for planning. We watch where people hesitate, note any confusion between being open and being committed, and fix the most important problems we find. |
| Dec 9 | **Final demo** | UI polish, bug fixes, empty and error states, final documentation (README, updated design docs, testing report), and a rehearsed demo. |

**Stretch goals** come from our ethical analysis and are attempted only after Beta is stable:

- Shareable group invitation links (Insight 6)
- Levels of willingness on openings, such as "would love to" vs. "could be convinced" (Insight 3)
- Optional activity suggestions for an overlap (Insight 4)

The design summary lists these as open issues rather than MVP commitments.

## 2. Team Responsibilities

Each person owns concepts from backend to frontend. The owner builds the concept, writes its tests, writes the reactions that change its state, and builds the screens for it. Authenticating and Notifying are the simplest concepts, so one person owns both. Each of the other three concepts has its own owner. Areas are paired so each one has a second person who reviews its pull requests.

| Member | Primary ownership | Reviews |
| --- | --- | --- |
| Varun | Grouping: group creation, invitations, accepting and declining, leaving and removal, membership screens, and the membership checks other reactions rely on. Also owns the frontend shell (shared layout, navigation, and design system from the visual study). | Anthony |
| Anthony | AvailabilitySharing: the openings editor, publishing to groups, the overlap calculation (`_sharedWith` across members), and the group overlap view. | Varun |
| Wyatt | Gathering: proposals, versioning, accept/decline/confirm, withdraw/cancel, the conflict checks against confirmed gatherings, and the gathering detail page. Also owns deployment and the database. | Desire |
| Desire | Authenticating and Notifying: registration, sign-in/sign-out, request authentication, the notice inbox, and all notification reactions. Also coordinates user testing. | Wyatt |
| Everyone | Integration testing at each checkpoint, user testing sessions, documentation, and the final demo. | — |

**Working agreement for the build:**

- We meet weekly with our mentor during Wednesday lecture time and post a short async update in the team chat twice a week.
- Every change goes through a pull request with one reviewer.
- A checkpoint branch is frozen the evening before each deadline so we can test the deployed version together.

## 3. Key Risks and Mitigations

| Risk | Why it matters | Mitigation | Fallback |
| --- | --- | --- | --- |
| **Gathering is too complex to finish by Beta** | Gathering is the heart of the app and our largest concept. Versioning, fresh acceptance after edits, automatic closure, and conflict checks all interact, and Beta falls right after Thanksgiving. | Build the simplest lifecycle first (propose, accept, decline, confirm, cancel), then add `invite`, `withdraw`, and finally `edit`. Write tests from the spec before connecting the UI. | Treat an edit as "cancel and re-propose to the same invitees." This keeps the rule that a changed plan needs fresh acceptance, without storing version history. |
| **Overlaps reveal people's private openings** | Our privacy commitment ([ethical analysis](problem-framing.md#ethical-analysis)) is that members see only shared overlaps, never someone's individual openings. Computing overlaps in the browser from raw openings would break this. | Compute overlaps only on the server, inside the reaction that checks group membership. Responses contain overlap intervals, not other people's openings. Add tests checking that no other member's opening appears in any response. | Show only times when *every* member is open, with no count of how many people are free. This reveals less but is less useful in larger groups. |
| **We can't test the core idea with real groups** | OpenTime only works when several people in the same group keep their openings up to date. Testing with individuals won't tell us whether the app actually helps friends meet, which is the main assumption our problem framing says we must test. | Recruit three real friend groups before Beta, such as a dorm floor, a sports team, and a study group. In the first session, have each group add a week of openings together so the app isn't empty. | Run moderated sessions in which team members play the other group members, and report this limitation honestly in the testing results. |

## 4. Priority Order If Time Runs Short

When we have to cut scope, we protect the core journey and cut in this order, first item first:

1. Stretch goals (invitation links, willingness levels, activity suggestions)
2. Non-essential notifications (withdrawal, automatic closure, decline-to-organizer)
3. Gathering version history (fall back to cancel and re-propose)
4. Visual polish beyond the design study's type, color, and layout basics

We do not cut these, because they are the core of OpenTime: groups with consensual membership, private openings, server-computed overlaps, and proposals that become confirmed only through explicit acceptance.
