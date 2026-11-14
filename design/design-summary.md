# Design Summary

## The Problem

The core problem OpenTime solves is coordinating availabilities within a group to schedule an event by making the process simple, organized, and automated. Our identified bad situations include:

- Lack of coordination and confirmation when planning events.
- Ambiguous availability times; whether one is willing to meet during a seemingly open time slot.
- Unknown and unclear availability times.

## Concepts

- `Authenticating` allows users to input, store, and publish times they are **willing to meet** in one place through `AvailabilitySharing`. Groups, created by `Grouping`, dictate who one can share their availabilities with. These three concepts work together to remove any questions of unwilling times to meet and solidify when people in a group are available.
- After a group shares their open times with one another and finds possible slots to meet, a group member may propose an event with `Gathering`, sending the invitation to all members. Each person may either accept, decline, or withdraw their acceptance to formalize their presence at the event. The gathering organizer may edit the event details, sending out new invitations to those affected. In addition, the organizer may cancel the event altogether.
- To address the possible lack of communication during event planning, the `Notifying` concept sends messages to group members for important notices, such as a sent invitation, event detail change, and cancellations.

With the five above concepts, OpenTime guarantees reducing the likelihood of encountering the aforementioned bad situations by ensuring one's available times are communicated with others clearly and that tentative plans become gatherings.

## Addressed Ethical Analysis Concerns

Our design addresses the following concerns brought up from our [ethical analysis](./problem-framing.md#ethical-analysis):

1. **Last minute schedule change after confirmation:** Invitees can `withdraw` their attendance to a gathering under the `Gathering` concept. A reaction notifies the event organizer and other attendees of the withdrawl with the `Notifying` concept.
2. **Privacy concerns with sharing schedules:** Users only know their own specific open times; only overlaps are shared within a group. The `AvailabilitySharing` concept handles creating and sharing times, and it is important to note that others only see group overlaps through reactions, never the entire schedule of one individual.
3. **Scheduling an event for large groups requires registration and manual work:** Each gathering under the `Gathering` concept has its own URL for easy distribution to large audiences. However, each invitee must still register and authenticate with their account with `Authenticating` to formally `join` a group. **Note: This feature might not be fully implemented in the MVP.**

## Unclear Issues

- Flexibility on proposing events to just a couple individuals within a larger group. Currently, users must create new groups to solve this problem, but this may get tedious over time for both the group owner and members.
- Scalability for notifications as for larger groups, flooding one's inbox with notifications is undesirable. This raises the questions of which messages are important enough to require delivery and how customizable should notification settings be.
