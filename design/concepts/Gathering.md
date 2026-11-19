# Gathering

## Purpose

Establish a definite arrangement among people who explicitly agree to attend.

## Principle

An organizer proposes details and thereby accepts them. Invitees respond to the current version. The organizer confirms the exact accepted roster. Silence remains pending. This first implementation slice covers the initial version and confirmation; editing, later invitations, and withdrawals follow in the next slice.

## Types

```types
external User
external Context
GatheringStatus is PROPOSED or CONFIRMED or CANCELLED
ResponseStatus is PENDING or ACCEPTED or DECLINED or WITHDRAWN
opaque Invitees
  Distinct invited User identities other than the organizer.
opaque Attendees
  The current accepted roster, including the organizer.
opaque AffectedUsers
  Users affected by a response.
opaque GatheringSummaries
  Details of gatherings visible to one participant.
opaque CommitmentIntervals
  Confirmed intervals for selected participants, internal to overlap calculation.
```

## State

```state
a set of Gatherings with
  an organizer User
  a context Context
  a status GatheringStatus
  a currentVersion Version
  an attendees Attendees

a set of Versions with
  a gathering Gathering
  a number Number
  a purpose String
  an activity String
  a place String
  a start DateTime
  an end DateTime
  unique gathering and number

a set of Responses with
  a version Version
  a user User
  a status ResponseStatus
  unique version and user

Rule: The organizer accepts the current version. A confirmed gathering's attendees are exactly its current version's accepted users.
Rule: A user cannot attend overlapping confirmed gatherings.
```

## Actions

```actions
propose(organizer: User, context: Context, invitees: Invitees, purpose: String, activity: String, place: String, start: DateTime, end: DateTime) : returns (gathering: Gathering, version: Version)
  where the invitee set or details or interval is invalid
  then
    refuses INVALID_GATHERING "Choose invitees and valid future gathering details."
  where the organizer already attends a confirmed conflict
  then
    refuses GATHERING_CONFLICT "A participant has a conflicting confirmed gathering."
  where all proposal details are valid
  then
    create version 1 with organizer ACCEPTED and invitees PENDING
    returns gathering, version

accept(user: User, gathering: Gathering, version: Version) : returns (joined: Flag, affectedUsers: AffectedUsers)
  where the version is stale, not proposed, or has started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where user has no invitation or has already accepted
  then
    refuses GATHERING_FORBIDDEN "You cannot respond to this invitation."
  where user is invited and attends no confirmed conflict
  then
    set user to ACCEPTED and return joined false and the organizer as affectedUsers
    returns joined, affectedUsers
  where user already attends a confirmed conflict
  then
    refuses GATHERING_CONFLICT "A participant has a conflicting confirmed gathering."

decline(user: User, gathering: Gathering, version: Version) : returns ()
  where the version is stale, not proposed, or has started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where user is not PENDING
  then
    refuses GATHERING_FORBIDDEN "You cannot respond to this invitation."
  where user is PENDING on the current version
  then
    set user to DECLINED
    returns

confirm(user: User, gathering: Gathering, version: Version, expectedAttendees: Attendees) : returns (attendees: Attendees)
  where user is not the organizer
  then
    refuses GATHERING_FORBIDDEN "Only the organizer can confirm."
  where the version, status, time, or accepted roster differs from the request, or only the organizer accepted
  then
    refuses STALE_GATHERING "Refresh the accepted roster before confirming."
  where an accepted participant has a confirmed conflict
  then
    refuses GATHERING_CONFLICT "A participant has a conflicting confirmed gathering."
  where the displayed version and roster are current and conflict-free
  then
    atomically set CONFIRMED and attendees to the accepted roster
    returns attendees
```

## Queries

```queries
_get(gathering: Gathering) : optional (organizer: User, context: Context, version: Version, purpose: String, activity: String, place: String, start: DateTime, end: DateTime, status: GatheringStatus, invitees: Invitees, accepted: Attendees, attendees: Attendees)
  Returns the current version and roster, or no row if absent.

_visibleTo(user: User, gathering: Gathering) : one (allowed: Flag)
  Answers whether user has a response to the current version.

_listFor(user: User) : one (gatherings: GatheringSummaries)
  Returns current gatherings whose version includes a response from user, ordered by start.

_commitmentsFor(users: Invitees, from: DateTime, to: DateTime, now: DateTime) : one (commitments: CommitmentIntervals)
  Returns clipped confirmed attendance intervals for selected users as one internal record.
```
