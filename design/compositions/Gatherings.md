# Gatherings composition

The first confirmation slice authenticates every request. Only an active group member may propose to distinct current members of that group. The organizer's proposal counts as acceptance. Invitees can accept or decline the version they reviewed, and silence remains pending. The organizer confirms only the exact currently accepted roster, with at least one other attendee. A MongoDB transaction serializes competing confirmations and rejects overlapping confirmed commitments. The list and detail views include only gatherings in which the requester has a current response.

The endpoints are [propose](reaction:OpenTime.Gatherings.Propose), [accept](reaction:OpenTime.Gatherings.Accept), [decline](reaction:OpenTime.Gatherings.Decline), [confirm](reaction:OpenTime.Gatherings.Confirm), [list](reaction:OpenTime.Gatherings.List), and [get](reaction:OpenTime.Gatherings.Get).

```endpoints
OpenTime.Gatherings.Propose at /gatherings/propose
OpenTime.Gatherings.Accept at /gatherings/accept
OpenTime.Gatherings.Decline at /gatherings/decline
OpenTime.Gatherings.Confirm at /gatherings/confirm
OpenTime.Gatherings.List at /gatherings/list
OpenTime.Gatherings.Get at /gatherings/get
```
