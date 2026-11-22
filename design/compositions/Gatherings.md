# Gatherings composition

Every request is authenticated. Only an active group member may propose to distinct current members of that group. Additional invitations require both organizer and invitee to be current group members. The organizer's proposal counts as acceptance. Invitees can accept or decline the version they reviewed, and silence remains pending. The organizer confirms only the exact currently accepted roster, with at least one other attendee. The organizer can edit the current version before it starts; this preserves the old version and responses, releases any confirmed commitment, and makes all invitees respond afresh. An invited person can accept a confirmed version before its start and immediately join its attendees. An accepted invitee can withdraw; the organizer can cancel. Alpha serializes changes within one app process, checks commitments, and conditionally updates each gathering document; multiple app instances cannot guarantee conflict exclusion. The list and detail views include only gatherings in which the requester has a current response.

The endpoints are [propose](reaction:OpenTime.Gatherings.Propose), [invite](reaction:OpenTime.Gatherings.Invite), [edit](reaction:OpenTime.Gatherings.Edit), [accept](reaction:OpenTime.Gatherings.Accept), [decline](reaction:OpenTime.Gatherings.Decline), [confirm](reaction:OpenTime.Gatherings.Confirm), [withdraw](reaction:OpenTime.Gatherings.Withdraw), [cancel](reaction:OpenTime.Gatherings.Cancel), [list](reaction:OpenTime.Gatherings.List), and [get](reaction:OpenTime.Gatherings.Get).

```endpoints
OpenTime.Gatherings.Propose at /gatherings/propose
OpenTime.Gatherings.Invite at /gatherings/invite
OpenTime.Gatherings.Edit at /gatherings/edit
OpenTime.Gatherings.Accept at /gatherings/accept
OpenTime.Gatherings.Decline at /gatherings/decline
OpenTime.Gatherings.Confirm at /gatherings/confirm
OpenTime.Gatherings.Withdraw at /gatherings/withdraw
OpenTime.Gatherings.Cancel at /gatherings/cancel
OpenTime.Gatherings.List at /gatherings/list
OpenTime.Gatherings.Get at /gatherings/get
```
