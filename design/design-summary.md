# Design Summary

## The Problem

Friends can miss opportunities to spend time together even when they are willing and available. Someone must discover that an invitation would be welcome, propose concrete details, and establish who has committed. Group chats can leave these decisions scattered across messages, while an empty calendar does not necessarily communicate willingness to socialize. OpenTime aims to make shared willingness discoverable and help friends turn it into a definite plan without exposing their complete schedules.

## Concepts

- `Authenticating` identifies the account responsible for each request. `Grouping` maintains consensual group membership through individual invitations or shared join links. Reactions use identity and membership to control access.
- `AvailabilitySharing` lets users record free time without a purpose and publish it to all current groups or selected groups. One opening can serve several groups. Reactions calculate common intervals from current members' shared openings, excluding their confirmed commitments. Other members receive these overlaps rather than individual openings. A gathering gets its purpose when someone proposes it.
- `Gathering` turns a proposal into a confirmed arrangement. An organizer chooses invitees from the group, proposes an activity, time, and place, and confirms those who explicitly accept. Additional invitees can join a confirmed gathering by accepting its current details. Editing creates a new version requiring fresh acceptance and confirmation.
- `Notifying` provides an in-app inbox for invitations, responses, edits, confirmation, withdrawal, and cancellation. Reactions specify the recipients of each notice. Reading a notice does not establish acceptance or attendance.

With the five above concepts, OpenTime aims to reduce the likelihood of encountering the aforementioned bad situations by ensuring one's available times are communicated with others clearly and that tentative plans become gatherings. We will test this theory during user testing.

## Addressed Ethical Analysis Concerns

Our design responds to the following concerns from the [ethical analysis](problem-framing.md#ethical-analysis):

1. **Changing plans without overriding consent:** Participants can withdraw without giving a personal explanation, and affected people receive notices. Editing requires fresh acceptance of the revised details. If the last non-organizer attendee withdraws and no invitations remain pending, the confirmed gathering closes automatically.

2. **Privacy when sharing willingness:** Individual openings remain private to their owners. Authorized group members receive only calculated overlaps, with no details of conflicting gatherings. These aggregate results can still reveal some availability, especially in two-person groups, so privacy is limited rather than absolute.

3. **Exclusion of people who do not adopt the app:** Group join links reduce individual invitation work, but joining and responding still require an account. A gathering URL identifies an event without granting membership or attendance rights. Nonuser participation remains unresolved and more of a stretch goal.

4. **Pressure to participate and uncertainty for organizers:** Openings do not count as acceptance, and silence remains pending. Explicit responses and withdrawal notices help organizers understand commitments without requiring public reliability ratings or explanations for declining. The app cannot prevent no-shows or guarantee that friends will cooperate.

## Unclear Issues

- **Overlaps for selected members:** Members can search for a time with specific current group members. The requester is always included and must pick at least one other person. Results contain common intervals only. In a two-person search someone can infer the other person’s availability within their own shared time. The opening editor explains this before sharing. We still need to observe whether people understand that disclosure and find the search useful.

- **Notification volume:** Larger groups may generate too many notices. Testing should establish which changes people need to see and whether notification preferences or batching would help. The MVP uses the notices specified in the concept design.

- **Adoption and maintaining openings:** The benefit depends on friends keeping their openings current. We need to test whether the opportunities discovered justify that effort and whether nonusers become excluded. Willingness levels, activity suggestions, and guest participation remain possible extensions rather than prerequisites for the core workflow.
