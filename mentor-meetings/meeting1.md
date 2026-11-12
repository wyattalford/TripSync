# OpenTime: Initial TA Mentor Meeting

**Course:** 6.1040 Software Design, Fall 2026  
**Team:** Varun Ravilla, Anthony Zheng, Desire, Wyatt Alford  
**Meeting date/time:** 11/11 1PM - 32-370
**TA mentor:** Eagon  

## Agenda

**Goal:** Get feedback on whether our bad situation is specific and compelling, agree on a manageable first version, and establish how we will work with our mentor.


| Time      | Topic                                  | Intended outcome                                                                                                                              |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–5 min   | Introductions and working arrangements | Introduce each member and agree on weekly meeting and update expectations.                                                                    |
| 5–13 min  | Project summary and bad situation      | Check whether the missed opportunity below is a strong focus for the project. Also ask about Desire's other idea regarding betting trivia app |
| 13–23 min | Solution sketch and scope              | Walk through availability → invitation → confirmed plan and identify the essential behavior.                                                  |
| 23–33 min | Main issues and risks                  | Discuss adoption, privacy, stale availability, and evidence needed for problem framing.                                                       |
| 33–40 min | Decisions and next steps               | Record scope decisions, assign owners, and agree on the next week's work.                                                                     |




## Project summary



### Domain and intended users

OpenTime is for existing friend groups who want to spend time together but often leave conversations at “we should hang out.” Their schedules change, and knowing someone has no scheduled commitment does not necessarily mean they want to make plans. Our focus is helping friends recognize a shared opportunity to meet and act on it while it is still available.

### Bad situation

Friends repeatedly talk about getting together, but nobody knows when the others are both available and interested in making plans. A shared opening passes before anyone proposes something concrete, even though several people would have liked to meet.

**Illustrative scenario, to validate with users:** On Monday, three friends say they should hang out that week, but they leave the time undecided. Each later has Friday evening open, assumes the others are busy, and waits for someone else to suggest a plan. On Saturday, they discover that they were all available. They missed an opportunity to see each other because their willingness and overlapping time were never made visible early enough to act on.

This example is a working hypothesis. We need to establish how often it happens and whether the effort of sharing availability would be worthwhile.

### Solution ideas so far

OpenTime is a shared “inverse calendar”: friends mark time when they are open to hanging out. The app makes overlapping windows visible so that someone can propose a specific plan without first starting another round of availability messages. Marking time as open expresses willingness to receive an invitation, but accepting an invitation is a separate commitment.

For the Friday example:

1. The friends share open windows with their group.
2. They can see that all three overlap on Friday from 7–9 p.m.
3. One friend proposes dinner at 7:30 p.m. and invites the others.
4. Invitees respond, and the app clearly identifies who has agreed to the plan.

**Proposed first version for discussion:** Sharing and revising open windows within a friend group, viewing overlap, proposing a plan, and recording responses. We propose focusing on local hangouts first with planning larger and longer trips as a possible later extension.

Group chats remain useful for conversation, but a vague invitation can stall without a concrete time. A poll can help once someone has initiated a plan and suggested options. Our hypothesis is that OpenTime can help earlier, by revealing an opportunity before someone has organized an event. We still need to compare this benefit with the work users must do to maintain their availability.

## Issues to discuss

1. **Is the problem narrow and compelling enough?** We want to focus on missed opportunities among friends who already want to meet. We would like feedback on whether the Friday scenario gives us a clear target and what evidence would distinguish this problem from a general lack of motivation to make plans.
2. **Will friends maintain their availability?** The app only helps if enough members share useful windows. We need to test whether entering and updating those windows takes less effort than the coordination it replaces, and decide how to handle outdated windows.
3. **How should privacy and social pressure work?** Sharing free time could make people feel obligated to accept invitations or explain a refusal. We need to decide who can see each window and make it clear that being open does not promise attendance.
4. **What makes a plan confirmed?** An overlap does not establish agreement about the activity, location, or participants. We need clear rules for accepting, declining, changing, and canceling a proposal so users can tell what they have committed to.
5. **What belongs in the first implementation?** We propose starting with manually entered windows so the main flow can be tested without calendar integration. We would like advice on the smallest useful scope and how to separate availability, invitations, and commitments into concepts using the required sync engine.



## Plans & decisions



### Proposed work for the next week

These are proposals to review with Eagon, not commitments already agreed at the meeting.


| Proposed task                                                                                        | Expected result                                              | Target  | Owner             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------- | ----------------- |
| Finish the problem framing and the ethical analysis based on where we stand at meeting time.         | Focused F2 document with corroboration and ethical analysis. | Nov. 12 | Assign at meeting |
| Define the essential concepts and walk through an invitation from shared availability to commitment. | F3 concept designs, syncs, and incremental development plan. | Nov. 16 | Assign at meeting |
| Determine when to meet each week and where as well as who will write each mentor meeting plan        | Meeting schedule                                             | Nov. 11 | Assign at meeting |




### Decisions made — complete after the meeting

- **Agreed problem and initial scope:** To be recorded. 
- **Design decisions and reasons:** To be recorded.
- **Mentor feedback and unresolved questions:** To be recorded.
- **Confirmed tasks, owners, and deadlines:** Update the table above after discussion.
- **Next mentor meeting and update arrangements:** To be recorded.

## Notes:
Concerns/Draw Concepts from here:

- show the idea that really distinguishes us from when2meet and shared calendars
  - why we are really different
- what if you have a group member whose constraints change ie dynamic needs
  - whiteboard ie 1 source of truth for scheduling
  - map it out clearly how each of the competitors have their own bad situation that ours fixes
    - calendly, when2meet, etc
    - shared calendar
      - not all free time is time you want to hang out - ie too revealing of calendar
    - When2Meet
      - if someone's time preferences change then you need to send out a new when2meet
      - One event and you have to create it every new time
        - ie want to hang out every weekend each time you have to create a new when2meet every time
    - Calendly
      - intent
      - No input for this particular purpose
      - One calendar and just open times
        - solution is open calendar with a purpose, so you can block times for specific things
      - Social commitment of actually going when someone books time through social expectation
        - idea of booking and guarenteeing time with someone
        - why sign up for opentime
          - when opentime says you should hang out at this time you have to/should go
            - this makes it worth the one time fee of signing up and signing in each day

When to meet:
    Lecture time on Wednesday

