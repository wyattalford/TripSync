# AvailabilitySharing

## Purpose

Communicate when a user is free to selected audiences.

## Principle

A user creates a dated free-time opening and publishes it to selected audiences. They can choose every current group or select particular groups. One opening serves every selected audience. The owner can revise or withdraw it. An opening does not commit its owner to a gathering and stops contributing after its end time.

## Types

```types
external User
external Audience
opaque Audiences
  The set of selected Audience identities for one opening.
opaque SharedIntervals
  Intervals contributed to one audience by individual owners; internal to overlap calculation.
opaque OwnedOpenings
  A user's openings with their details and selected audience identities.
opaque OverlapIntervals
  Continuous common intervals at least the requested duration long, ordered by start.
opaque PartialSuggestions
  Best intervals for the largest available subset when no full-group interval meets the duration, with counts and names of unavailable members.
```

## State

```state
a set of Openings with
  an owner User
  a start DateTime
  an end DateTime
  an audiences Audiences

Rule: Each opening has start before end.
Rule: An owner's openings do not overlap.
```

## Actions

```actions
create(owner: User, start: DateTime, end: DateTime) : returns (opening: Opening)
  where the interval is invalid or end is not in the future
  then
    refuses INVALID_OPENING "Enter a valid future-ending time range."
  where another opening owned by owner overlaps the interval
  then
    refuses OPENING_CONFLICT "Your openings cannot overlap."
  where the opening is valid and does not overlap another opening
  then
    create an unshared opening
    returns opening

publish(user: User, opening: Opening, audiences: Audiences) : returns ()
  where opening does not exist
  then
    refuses OPENING_NOT_FOUND "This opening cannot be found."
  where opening does not belong to user
  then
    refuses OPENING_FORBIDDEN "You cannot change this opening."
  where opening belongs to user
  then
    replace the opening's audience set
    returns

revise(user: User, opening: Opening, start: DateTime, end: DateTime, audiences: Audiences) : returns ()
  where opening does not exist
  then
    refuses OPENING_NOT_FOUND "This opening cannot be found."
  where opening does not belong to user
  then
    refuses OPENING_FORBIDDEN "You cannot change this opening."
  where opening has ended, no supplied value changes, or supplied details are invalid
  then
    refuses INVALID_OPENING "Change at least one detail of an active opening to a valid interval."
  where another opening owned by user overlaps the replacement interval
  then
    refuses OPENING_CONFLICT "Your openings cannot overlap."
  where the replacement is valid and does not overlap another opening
  then
    replace interval and audience set
    returns

withdraw(user: User, opening: Opening) : returns ()
  where opening does not exist
  then
    refuses OPENING_NOT_FOUND "This opening cannot be found."
  where opening does not belong to user
  then
    refuses OPENING_FORBIDDEN "You cannot change this opening."
  where opening belongs to user
  then
    remove the opening
    returns
```

## Queries

```queries
_owned(user: User) : many (opening: Opening, start: DateTime, end: DateTime, audiences: Audiences)
  Returns the user's openings, including ended openings, ordered by start then end.

_sharedWith(audience: Audience, from: DateTime, to: DateTime) : many (owner: User, start: DateTime, end: DateTime)
  Returns still-current intervals shared with the audience and clipped to the search range and current time. No rows for an empty or reversed range.

_sharedSnapshot(audience: Audience, from: DateTime, to: DateTime, now: DateTime) : one (intervals: SharedIntervals)
  Returns the same intervals as one internal snapshot for server-side overlap calculation. Never exposed as a public endpoint.

_overlapSnapshot(user: User, group: Audience, from: DateTime, to: DateTime, duration: Number, now: DateTime) : one (allowed: Flag, overlaps: OverlapIntervals, suggestions: PartialSuggestions)
  Uses the internal read coordinator to combine membership, openings, and commitments from one MongoDB snapshot. Returns full-group overlaps when present; otherwise the best partial-group suggestions. No rows of individual openings are exposed.

_ownedSnapshot(user: User) : one (openings: OwnedOpenings)
  Returns only that user's openings as one record for the private editor view.
```
