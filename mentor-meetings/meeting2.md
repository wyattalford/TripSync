# OpenTime: Second TA Mentor Meeting

**Course:** 6.1040 Software Design, Fall 2026
**Team:** Varun Ravilla, Anthony Zheng, Desire, Wyatt Alford
**Meeting date:** November 18, 2026
**TA mentor:** Eagon
**Scribe:** Desire

## Agenda

**Goal:** Review our concept designs and development plan, make sure each of us has a concrete implementation responsibility, and identify integration and testing risks before the first checkpoint.

| Topic | Intended outcome |
| --- | --- |
| Reflections on design work | Discuss whether the bad situations helped us arrive at useful concepts. |
| Development plan and checkpoints | Review responsibilities, scope, and the timeline through the final demo. |
| Individual implementation plans | Confirm what each of us expects to have working by next week. |
| Testing and integration | Discuss situation-driven tests, dependencies between concepts, and compositions. |
| Next steps | Agree on immediate priorities and how to coordinate during implementation. |

## Discussion summary

### Reflections on concept design

We started by discussing how the recent work on bad situations and concept designs went. Breaking the bad situation into multiple scenarios helped expose different aspects of the problem and made it easier to think about a solution.

Eagon emphasized that the course is not mainly about following one particular software-building process. The more important lesson is to break down a problem at the conceptual level and design a solution to the actual bad situations.

### Development plan and timeline

Desire walked through the development plan, which divides primary concept ownership among the four of us and also assigns supporting responsibilities. All of us will help integrate the concepts.

| Member | Primary responsibility | Additional responsibility |
| --- | --- | --- |
| Varun | Grouping | NA |
| Anthony | AvailabilitySharing | NA |
| Wyatt | Gathering | App setup, deployment, database, and final integration pass |
| Desire | Authenticating and Notifying | Coordinating user testing |

The plan sets two implementation checkpoints:

**November 23 — First checkpoint:** Aim for a deployed app covering the first part of the user journey. Users should be able to register, sign in and out, create groups, invite members, accept or decline group invitations, and join via a shared link. Users should also be able to publish, revise, or withdraw open time windows and view group overlaps.

**November 30 — Second checkpoint:** Aim for the complete core journey: propose a gathering based on an overlap, respond to invitations, confirm a gathering, and support changes to proposals, including versioning where needed.

**December 1–7 — User testing and iteration:** Test with different groups of friends, collect feedback, and revise the app based on what we learn.

Eagon said the plan provided a useful structure through the final demo, while noting that plans can change as implementation progresses.

### How we will divide and coordinate the work

Wyatt suggested that, while each of us should continue owning a concept, we should also take into account when each of us actually has time to work during the week. Whoever is available earlier might help build the initial app or unblock work that someone else will pick up later. Concept owners would still be responsible for reviewing and refining their areas before submission.

Desire pointed out that the development plan also assigns code reviewers. We should each coordinate our timelines with our reviewers so that reviews happen before deadlines. Eagon supported having reviewers as a way to maintain accountability, provided we all agree on the schedule.

Eagon cautioned that owning a concept means more than implementing its specification and passing a few tests. Each of us should understand which user situations the concept needs to support. Tests should cover realistic flows and the actions and queries the UI will need, not only invariants. Otherwise, a concept may look correct in isolation but turn out to be missing actions, queries, or edge cases once connected to the frontend.

## Individual implementation plans

### Wyatt — Gathering and app infrastructure

Wyatt plans to set up the Sync Engine, MongoDB, and Vue, and begin implementing Gathering. The main workflow includes proposing a gathering, updating or versioning the proposal, accepting or declining, and confirming it. He expects this to form the core gathering journey.

Eagon said the scope sounded reasonable, but noted that proposals, versioning, responses, and confirmation might eventually be better represented as more than one concept. He encouraged incremental design: if implementation reveals that a concept should be split or revised, we can change the design. Git history will preserve earlier versions; the important thing is that the final design documentation is understandable to someone reviewing it later.

Wyatt also volunteered to do a final integration and quality pass before submission. We agreed that integration should ideally happen continuously as we each build our parts, rather than only at the end. We discussed aiming to finish implementation internally by Sunday or Monday morning to leave time for review before submission.

### Desire — Authenticating, Notifying, and user testing

Desire plans to implement registration, sign-in, sign-out, and the authentication UI by next week, while studying the Notifying concept and how it will fit into the app.

Eagon asked whether authentication would use MIT's common sign-in system or a general user account system. Desire explained that the app needs to be tested with people outside the class, so the current plan is to use regular username-and-password accounts rather than MIT-specific authentication.

For the alpha version, notifications will be in-app only. Email or text notifications are possible later additions for the beta version. Eagon mentioned Twilio for text messages and Resend for email as developer-friendly options if we decide to add external notifications.

Desire will also coordinate user testing during the December 1–7 period.

### Anthony — AvailabilitySharing

Anthony plans to build a basic interface where users can enter their available times. He also wants those times to appear in the groups they belong to and eventually support overlap calculations.

Anthony noted that this functionality depends partly on Grouping. Eagon recommended keeping the AvailabilitySharing concept and its tests as independent as possible, even if the eventual UI depends on group membership. The concept should be useful and testable on its own, with group-related behavior added through integration later. This should reduce unnecessary dependencies and make problems easier to isolate.

### Varun — Grouping

Varun plans to implement the Grouping data model and the workflows for inviting people to groups and accepting or declining invitations. The focus should be on making these user workflows work end to end, rather than just implementing individual operations. Shared invitation links were also discussed as part of the planned group-joining flow.

## Integration and compositions

Anthony raised a concern about who will own compositions that involve multiple concepts, since the current plan primarily assigns each of us an individual concept.

Eagon agreed that compositions can require more work than the concepts themselves. The difficult part is often getting independently implemented pieces to work together correctly. He recommended that each of us identify which other concepts our work depends on and collaborate with the relevant owners. Where possible, individual concepts should be completed early enough to leave time to design and test example compositions together.

Wyatt said he would begin implementation immediately and could help with other areas if his assigned work progressed quickly. He also suggested that we regroup and adjust responsibilities if needed.

**Working approach:** Keep clear concept ownership, coordinate closely on cross-concept workflows, integrate incrementally, and leave time for code review and end-to-end testing before each checkpoint. Wyatt will make a final pass, but integration is not solely his responsibility.

## Plans & decisions

### Decisions and working agreements

1. Keep the current concept ownership: Varun—Grouping; Anthony—AvailabilitySharing; Wyatt—Gathering; Desire—Authenticating and Notifying.
2. Use regular user accounts for the initial authentication flow, rather than MIT-specific sign-in.
3. Start with in-app notifications; consider email or SMS later rather than including them in the alpha scope.
4. Allow concept designs to evolve during implementation, keeping the final documentation up to date.
5. Develop and test concepts against realistic user journeys, including necessary actions, queries, and edge cases.
6. Coordinate across concept boundaries and integrate throughout development, with Wyatt performing a final pass before submission.

## Notes and risks to keep in mind

- **Situation-driven testing:** Tests should demonstrate that a concept solves the relevant user problems, not just that its internal invariants hold.
- **Concept dependencies:** AvailabilitySharing and Grouping need to work together, but should be implemented and tested independently where possible.
- **Compositions:** Cross-concept interactions may be more complex than individual concepts. We should identify owners and collaborators for these flows early.
- **Scope changes:** Gathering may need to be split into smaller concepts as we learn more. We should update the design instead of treating the original concept boundaries as fixed.
- **Scheduling and reviews:** Our availability may differ during the week, so we should communicate when work will be ready for integration and review.
- **External notifications:** SMS and email are later possibilities, not requirements for the first version.

Eagon closed by saying that we are on track and encouraged us to reach out during the week with implementation or logistical questions.
