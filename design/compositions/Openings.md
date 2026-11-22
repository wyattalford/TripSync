# Openings composition

Every endpoint authenticates the request cookie. Users create private dated free-time openings, then publish them to chosen active groups in which they are members. They may select every current group in one step or choose particular groups. They can revise or withdraw only their own openings. The owner-only list returns individual details. The overlap endpoint checks current group membership and returns complete-group intervals, minus confirmed gathering commitments, or partial-group suggestions if none exist; it never returns other people's raw opening or gathering details. Duration is measured in minutes. Gathering purpose is chosen only when proposing a plan.

The endpoints are [create](reaction:OpenTime.Openings.Create), [publish](reaction:OpenTime.Openings.Publish), [revise](reaction:OpenTime.Openings.Revise), [withdraw](reaction:OpenTime.Openings.Withdraw), [mine](reaction:OpenTime.Openings.Mine), [find overlap](reaction:OpenTime.Openings.FindOverlap), [selected-member search](reaction:OpenTime.Openings.FindSelectedOverlap), and [availability calendar](reaction:OpenTime.Openings.Calendar). Search authenticates the requester and reads membership, shared openings, and confirmed commitments from one MongoDB snapshot. Full-group search returns common intervals or the best partial-group suggestions. Selected-member search includes the requester and returns only common intervals for the selected current members. The calendar returns availability counts and qualifying windows, not identities or individual opening rows. A failed snapshot yields a retryable error.

```endpoints
OpenTime.Openings.Create at /openings/create
OpenTime.Openings.Publish at /openings/publish
OpenTime.Openings.Revise at /openings/revise
OpenTime.Openings.Withdraw at /openings/withdraw
OpenTime.Openings.Mine at /openings/mine
OpenTime.Openings.FindOverlap at /openings/overlap
OpenTime.Openings.FindSelectedOverlap at /openings/selected-overlap
OpenTime.Openings.Calendar at /openings/calendar
```

```computations
fullGroupOverlaps(members: Grouping.Members, openings: AvailabilitySharing.SharedIntervals, commitments: AvailabilitySharing.SharedIntervals, from: DateTime, to: DateTime, now: DateTime, durationMinutes: Number) : AvailabilitySharing.OverlapIntervals
  Combine adjacent openings for each member, subtract confirmed commitments, intersect every current member's usable intervals, clip to the current search range, and retain continuous intervals at least durationMinutes long.
```
