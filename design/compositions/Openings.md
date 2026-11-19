# Openings composition

Every endpoint authenticates the request cookie. Users create private dated openings, then publish them to chosen active groups in which they are members. They can revise or withdraw only their own openings. The owner-only list returns individual details. The overlap endpoint checks current group membership and responds only with common intervals for every current member; it never returns other people's opening details. Duration is measured in minutes. Purposes are free text and match exactly. Commitment masking is added when Gathering is implemented.

The endpoints are [create](reaction:OpenTime.Openings.Create), [publish](reaction:OpenTime.Openings.Publish), [revise](reaction:OpenTime.Openings.Revise), [withdraw](reaction:OpenTime.Openings.Withdraw), [mine](reaction:OpenTime.Openings.Mine), and [find overlap](reaction:OpenTime.Openings.FindOverlap).

```endpoints
OpenTime.Openings.Create at /openings/create
OpenTime.Openings.Publish at /openings/publish
OpenTime.Openings.Revise at /openings/revise
OpenTime.Openings.Withdraw at /openings/withdraw
OpenTime.Openings.Mine at /openings/mine
OpenTime.Openings.FindOverlap at /openings/overlap
```

```computations
fullGroupOverlaps(members: Grouping.Members, openings: AvailabilitySharing.SharedIntervals, commitments: AvailabilitySharing.SharedIntervals, from: DateTime, to: DateTime, now: DateTime, durationMinutes: Number) : AvailabilitySharing.OverlapIntervals
  Combine adjacent openings for each member, subtract confirmed commitments, intersect every current member's usable intervals, clip to the current search range, and retain continuous intervals at least durationMinutes long. The current composition supplies an empty commitment set until Gathering is implemented.
```
