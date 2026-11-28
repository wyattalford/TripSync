# Gathering

## Purpose

Establish a definite arrangement among people who explicitly agree to attend.

## Principle

An organizer proposes details and thereby accepts them. Invitees respond to the current version. The organizer confirms the exact accepted roster. Silence remains pending. Editing creates a new version and releases old commitments until fresh acceptance and confirmation. An invitee who accepts a current confirmed version before it starts joins immediately if they have no conflicting commitment.

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
opaque UpcomingGatherings
  Confirmed gatherings starting soon, with version, details, and attendees; internal to reminders.
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
Rule: Earlier versions and their responses are retained unchanged after an edit.
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

invite(user: User, gathering: Gathering, version: Version, invitee: User) : returns ()
  where user is not the organizer, invitee is user, gathering is cancelled, version is stale or started, or invitee has a PENDING or ACCEPTED response
  then
    refuses GATHERING_FORBIDDEN "Only the organizer can invite an eligible person to the current gathering."
  where invitee has no current response or previously DECLINED or WITHDRAWN
  then
    set invitee's current-version response to PENDING without changing other responses or attendance
    returns

edit(user: User, gathering: Gathering, expectedVersion: Version, purpose: String, activity: String, place: String, start: DateTime, end: DateTime) : returns (version: Version, affectedUsers: AffectedUsers)
  where user is not the organizer, the gathering is cancelled, the version is stale, or the current version has started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where details are invalid or unchanged
  then
    refuses INVALID_GATHERING "Change at least one detail to valid future gathering details."
  where the organizer attends another confirmed conflict
  then
    refuses GATHERING_CONFLICT "A participant has a conflicting confirmed gathering."
  where the edit is valid
  then
    retain the old version and responses, create the next version with organizer ACCEPTED and other prior response users PENDING, set PROPOSED, and clear attendees
    returns version, affectedUsers

accept(user: User, gathering: Gathering, version: Version) : returns (joined: Flag, affectedUsers: AffectedUsers)
  where the version is stale, cancelled, or has started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where user has no invitation or has already accepted
  then
    refuses GATHERING_FORBIDDEN "You cannot respond to this invitation."
  where user is invited and attends no confirmed conflict
  then
    set user to ACCEPTED; if already CONFIRMED add user to attendees and return joined true with existing attendees as affectedUsers; otherwise return joined false and organizer as affectedUsers
    returns joined, affectedUsers
  where user already attends a confirmed conflict
  then
    refuses GATHERING_CONFLICT "A participant has a conflicting confirmed gathering."

decline(user: User, gathering: Gathering, version: Version) : returns ()
  where the version is stale, cancelled, or has started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where user is not PENDING
  then
    refuses GATHERING_FORBIDDEN "You cannot respond to this invitation."
  where user is PENDING on the current version
  then
    set user to DECLINED
    returns

withdraw(user: User, gathering: Gathering, version: Version) : returns (affectedUsers: AffectedUsers, status: GatheringStatus)
  where version is stale, gathering is cancelled, or current version has started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where user is organizer or has no ACCEPTED response
  then
    refuses GATHERING_FORBIDDEN "Only an accepted invitee can withdraw."
  where user accepted the current version
  then
    set user's response to WITHDRAWN; if confirmed, remove user from attendees; if only organizer remains and no responses are PENDING, cancel and clear attendance
    returns affectedUsers, status

cancel(user: User, gathering: Gathering, version: Version) : returns (affectedUsers: AffectedUsers)
  where user is not organizer
  then
    refuses GATHERING_FORBIDDEN "Only the organizer can cancel."
  where version is stale, cancelled, or started
  then
    refuses STALE_GATHERING "Refresh to review the current gathering."
  where user is organizer of a current gathering
  then
    set CANCELLED and clear attendance while retaining responses and versions
    returns affectedUsers

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

_contextFor(gathering: Gathering) : optional (context: Context)
  Returns the originating group for cross-concept invitation authorization.

_visibleTo(user: User, gathering: Gathering) : one (allowed: Flag)
  Answers whether user has a response to the current version.

_listFor(user: User) : one (gatherings: GatheringSummaries)
  Returns current gatherings whose version includes a response from user, ordered by start.

_startingBetween(from: DateTime, to: DateTime) : one (gatherings: UpcomingGatherings)
  Returns confirmed gatherings whose current version starts after from and no later than to, with attendees. Internal to reminders.

_commitmentsFor(users: Invitees, from: DateTime, to: DateTime, now: DateTime) : one (commitments: CommitmentIntervals)
  Returns clipped confirmed attendance intervals for selected users as one internal record.
```
