<!-- Generated from the OpenTime assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.1.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.1.0. -->

# OpenTime — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

### Authenticating

Defined in [Authenticating](../design/concepts/Authenticating.md), line 1.

#### Actions

- `register(username: String, password: String) : returns (user: User)`
  - Refuses `INVALID_CREDENTIALS`: A username and password are required.
  - Refuses `USERNAME_TAKEN`: That username is already registered.
- `signIn(username: String, password: String) : returns (session: Session, expiresAt: DateTime)`
  - Refuses `INVALID_CREDENTIALS`: The username or password is incorrect.
- `authenticate(session: Session) : returns (user: User)`
  - Refuses `UNKNOWN_SESSION`: This session is not active.
- `signOut(session: Session) : returns ()`
  - Refuses `UNKNOWN_SESSION`: This session is not active.

#### Queries

- `_exists(user: User) : one (exists: Flag)`
- `_byUsername(username: String) : optional (user: User)`
- `_username(user: User) : optional (username: String)`
- `_usernames(users: UserSet) : one (accounts: AccountLabels)`

#### Instances

- `Authenticating` — instance of `Authenticating` — [Application types](../design/types.md), line 12.

### AvailabilitySharing

Defined in [AvailabilitySharing](../design/concepts/AvailabilitySharing.md), line 1.

#### Actions

- `create(owner: User, start: DateTime, end: DateTime) : returns (opening: Opening)`
  - Refuses `INVALID_OPENING`: Enter a valid future-ending time range.
  - Refuses `OPENING_CONFLICT`: Your openings cannot overlap.
- `publish(user: User, opening: Opening, audiences: Audiences) : returns ()`
  - Refuses `OPENING_NOT_FOUND`: This opening cannot be found.
  - Refuses `OPENING_FORBIDDEN`: You cannot change this opening.
- `revise(user: User, opening: Opening, start: DateTime, end: DateTime, audiences: Audiences) : returns ()`
  - Refuses `OPENING_NOT_FOUND`: This opening cannot be found.
  - Refuses `OPENING_FORBIDDEN`: You cannot change this opening.
  - Refuses `INVALID_OPENING`: Change at least one detail of an active opening to a valid interval.
  - Refuses `OPENING_CONFLICT`: Your openings cannot overlap.
- `withdraw(user: User, opening: Opening) : returns ()`
  - Refuses `OPENING_NOT_FOUND`: This opening cannot be found.
  - Refuses `OPENING_FORBIDDEN`: You cannot change this opening.

#### Queries

- `_owned(user: User) : many (opening: Opening, start: DateTime, end: DateTime, audiences: Audiences)`
- `_sharedWith(audience: Audience, from: DateTime, to: DateTime) : many (owner: User, start: DateTime, end: DateTime)`
- `_sharedSnapshot(audience: Audience, from: DateTime, to: DateTime, now: DateTime) : one (intervals: SharedIntervals)`
- `_overlapSnapshot(user: User, group: Audience, from: DateTime, to: DateTime, duration: Number, now: DateTime) : one (allowed: Flag, overlaps: OverlapIntervals, suggestions: PartialSuggestions)`
- `_ownedSnapshot(user: User) : one (openings: OwnedOpenings)`

#### Instances

- `AvailabilitySharing` — instance of `AvailabilitySharing` — [Application types](../design/types.md), line 16.
  - `Audience` is `Grouping.Group` — [Application types](../design/types.md), line 18.
  - `User` is `Authenticating.User` — [Application types](../design/types.md), line 17.

### Gathering

Defined in [Gathering](../design/concepts/Gathering.md), line 1.

#### Actions

- `propose(organizer: User, context: Context, invitees: Invitees, purpose: String, activity: String, place: String, start: DateTime, end: DateTime) : returns (gathering: Gathering, version: Version)`
  - Refuses `INVALID_GATHERING`: Choose invitees and valid future gathering details.
  - Refuses `GATHERING_CONFLICT`: A participant has a conflicting confirmed gathering.
- `invite(user: User, gathering: Gathering, version: Version, invitee: User) : returns ()`
  - Refuses `GATHERING_FORBIDDEN`: Only the organizer can invite an eligible person to the current gathering.
- `edit(user: User, gathering: Gathering, expectedVersion: Version, purpose: String, activity: String, place: String, start: DateTime, end: DateTime) : returns (version: Version, affectedUsers: AffectedUsers)`
  - Refuses `STALE_GATHERING`: Refresh to review the current gathering.
  - Refuses `INVALID_GATHERING`: Change at least one detail to valid future gathering details.
  - Refuses `GATHERING_CONFLICT`: A participant has a conflicting confirmed gathering.
- `accept(user: User, gathering: Gathering, version: Version) : returns (joined: Flag, affectedUsers: AffectedUsers)`
  - Refuses `STALE_GATHERING`: Refresh to review the current gathering.
  - Refuses `GATHERING_FORBIDDEN`: You cannot respond to this invitation.
  - Refuses `GATHERING_CONFLICT`: A participant has a conflicting confirmed gathering.
- `decline(user: User, gathering: Gathering, version: Version) : returns ()`
  - Refuses `STALE_GATHERING`: Refresh to review the current gathering.
  - Refuses `GATHERING_FORBIDDEN`: You cannot respond to this invitation.
- `withdraw(user: User, gathering: Gathering, version: Version) : returns (affectedUsers: AffectedUsers, status: GatheringStatus)`
  - Refuses `STALE_GATHERING`: Refresh to review the current gathering.
  - Refuses `GATHERING_FORBIDDEN`: Only an accepted invitee can withdraw.
- `cancel(user: User, gathering: Gathering, version: Version) : returns (affectedUsers: AffectedUsers)`
  - Refuses `GATHERING_FORBIDDEN`: Only the organizer can cancel.
  - Refuses `STALE_GATHERING`: Refresh to review the current gathering.
- `confirm(user: User, gathering: Gathering, version: Version, expectedAttendees: Attendees) : returns (attendees: Attendees)`
  - Refuses `GATHERING_FORBIDDEN`: Only the organizer can confirm.
  - Refuses `STALE_GATHERING`: Refresh the accepted roster before confirming.
  - Refuses `GATHERING_CONFLICT`: A participant has a conflicting confirmed gathering.

#### Queries

- `_get(gathering: Gathering) : optional (organizer: User, context: Context, version: Version, purpose: String, activity: String, place: String, start: DateTime, end: DateTime, status: GatheringStatus, invitees: Invitees, accepted: Attendees, attendees: Attendees)`
- `_contextFor(gathering: Gathering) : optional (context: Context)`
- `_visibleTo(user: User, gathering: Gathering) : one (allowed: Flag)`
- `_listFor(user: User) : one (gatherings: GatheringSummaries)`
- `_commitmentsFor(users: Invitees, from: DateTime, to: DateTime, now: DateTime) : one (commitments: CommitmentIntervals)`

#### Instances

- `Gathering` — instance of `Gathering` — [Application types](../design/types.md), line 20.
  - `Context` is `Grouping.Group` — [Application types](../design/types.md), line 22.
  - `User` is `Authenticating.User` — [Application types](../design/types.md), line 21.

### Grouping

Defined in [Grouping](../design/concepts/Grouping.md), line 1.

#### Actions

- `create(owner: User, name: String) : returns (group: Group)`
  - Refuses `INVALID_GROUP`: Enter a group name.
- `invite(user: User, group: Group, invitee: User) : returns ()`
  - Refuses `GROUP_FORBIDDEN`: Only the owner can invite another account.
  - Refuses `MEMBERSHIP_CONFLICT`: This account is already invited or a member.
- `accept(user: User, group: Group) : returns ()`
  - Refuses `MEMBERSHIP_CONFLICT`: There is no active invitation to accept.
- `decline(user: User, group: Group) : returns ()`
  - Refuses `MEMBERSHIP_CONFLICT`: There is no active invitation to decline.
- `join(user: User, url: String) : returns (group: Group)`
  - Refuses `GROUP_FORBIDDEN`: Ask the owner for a new invitation.
  - Refuses `MEMBERSHIP_CONFLICT`: This link is unavailable or you already belong.
- `leave(user: User, group: Group) : returns ()`
  - Refuses `GROUP_FORBIDDEN`: You cannot leave this group.
- `remove(user: User, group: Group, member: User) : returns ()`
  - Refuses `GROUP_FORBIDDEN`: You cannot remove this person.
- `close(user: User, group: Group) : returns ()`
  - Refuses `GROUP_FORBIDDEN`: Only the owner can close an active group.

#### Queries

- `_getGroup(group: Group) : optional (owner: User, name: String, status: GroupStatus, members: Members)`
- `_membership(user: User, group: Group) : optional (status: MembershipStatus)`
- `_groupsFor(user: User) : many (group: Group)`
- `_joinUrl(group: Group) : optional (url: String)`
- `_visibleFor(user: User) : one (groups: GroupSummaries)`
- `_canShareWith(user: User, groups: GroupIds) : one (allowed: Flag)`
- `_accessFor(user: User, group: Group) : one (allowed: Flag, members: Members)`
- `_canPlanWith(user: User, group: Group, invitees: Members) : one (allowed: Flag)`
- `_canInviteToGathering(user: User, group: Group, invitee: User) : one (allowed: Flag)`

#### Instances

- `Grouping` — instance of `Grouping` — [Application types](../design/types.md), line 13.
  - `User` is `Authenticating.User` — [Application types](../design/types.md), line 14.

### Notifying

Defined in [Notifying](../design/concepts/Notifying.md), line 1.

#### Actions

- `notify(recipient: User, sourceKey: String, message: String, destination: String) : returns (notice: Notice)`
  - Refuses `INVALID_NOTICE`: A notice needs a source, message, and application destination.
- `markRead(user: User, notice: Notice) : returns ()`
  - Refuses `NOTICE_FORBIDDEN`: This notice is not yours.

#### Queries

- `_inbox(user: User) : one (notices: NoticeSummaries)`

#### Instances

- `Notifying` — instance of `Notifying` — [Application types](../design/types.md), line 24.
  - `User` is `Authenticating.User` — [Application types](../design/types.md), line 25.

## Computations

- `fullGroupOverlaps(members: Grouping.Members, openings: AvailabilitySharing.SharedIntervals, commitments: AvailabilitySharing.SharedIntervals, from: DateTime, to: DateTime, now: DateTime, durationMinutes: Number) : AvailabilitySharing.OverlapIntervals` — [Openings composition](../design/compositions/Openings.md), line 17.

## Reactions

### DeliverFaultToAsker

```reaction
when any action is faulted, not asked by DeliverFaultToAsker
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respondFramework (error: "INTERNAL_ERROR", requestId)
```

### DeliverRefusalToAsker

```reaction
when any action is refused (message), except RequestBoundary
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respond (error: message, requestId)
```

### OpenTime.Accounts.CurrentUser

Authored path: `OpenTime.Accounts.CurrentUser`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 10.

```reaction
when RequestBoundary.request (path: "/auth/current", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Accounts.CurrentUser#2

Authored path: `OpenTime.Accounts.CurrentUser`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 10.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Accounts.CurrentUser
where
  Authenticating._username (user) has (username)
  earlier, RequestBoundary.request (path: "/auth/current", requestId, session)
then
  RequestBoundary.respond (requestId, user, username)
```

### OpenTime.Accounts.Register

Authored path: `OpenTime.Accounts.Register`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 8.

```reaction
when RequestBoundary.request (password, path: "/auth/register", requestId, username)
then
  Authenticating.register (password, username)
```

### OpenTime.Accounts.Register#2

Authored path: `OpenTime.Accounts.Register`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 8.

```reaction
when Authenticating.register (password, username, user), asked by OpenTime.Accounts.Register
where
  earlier, RequestBoundary.request (password, path: "/auth/register", requestId, username)
then
  RequestBoundary.respond (requestId, user)
```

### OpenTime.Accounts.SignIn

Authored path: `OpenTime.Accounts.SignIn`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 9.

```reaction
when RequestBoundary.request (password, path: "/auth/sign-in", requestId, username)
then
  Authenticating.signIn (password, username)
```

### OpenTime.Accounts.SignIn#2

Authored path: `OpenTime.Accounts.SignIn`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 9.

```reaction
when Authenticating.signIn (password, username, expiresAt, session), asked by OpenTime.Accounts.SignIn
where
  earlier, RequestBoundary.request (password, path: "/auth/sign-in", requestId, username)
then
  RequestBoundary.respond (expiresAt, requestId, session)
```

### OpenTime.Accounts.SignOut

Authored path: `OpenTime.Accounts.SignOut`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 11.

```reaction
when RequestBoundary.request (path: "/auth/sign-out", requestId, session)
then
  Authenticating.signOut (session)
```

### OpenTime.Accounts.SignOut#2

Authored path: `OpenTime.Accounts.SignOut`.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 5.
- Covered by [Accounts composition](../design/compositions/Accounts.md), line 11.

```reaction
when Authenticating.signOut (session), asked by OpenTime.Accounts.SignOut
where
  earlier, RequestBoundary.request (path: "/auth/sign-out", requestId, session)
then
  RequestBoundary.respond (requestId, signedOut: true)
```

### OpenTime.Gatherings.Accept

Authored path: `OpenTime.Gatherings.Accept`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 11.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/accept", requestId, session, version)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Accept#2

Authored path: `OpenTime.Gatherings.Accept`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 11.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Accept
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/accept", requestId, session, version)
then
  Gathering.accept (gathering, user, version)
```

### OpenTime.Gatherings.Accept#3

Authored path: `OpenTime.Gatherings.Accept`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 11.

```reaction
when Gathering.accept (gathering, user, version, affectedUsers, joined), asked by OpenTime.Gatherings.Accept#2
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/accept", requestId, session, version)
then
  RequestBoundary.respond (joined, requestId)
```

### OpenTime.Gatherings.Cancel

Authored path: `OpenTime.Gatherings.Cancel`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 15.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/cancel", requestId, session, version)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Cancel#2

Authored path: `OpenTime.Gatherings.Cancel`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 15.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Cancel
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/cancel", requestId, session, version)
then
  Gathering.cancel (gathering, user, version)
```

### OpenTime.Gatherings.Cancel#3

Authored path: `OpenTime.Gatherings.Cancel`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 15.

```reaction
when Gathering.cancel (gathering, user, version, affectedUsers), asked by OpenTime.Gatherings.Cancel#2
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/cancel", requestId, session, version)
then
  RequestBoundary.respond (cancelled: true, requestId)
```

### OpenTime.Gatherings.Confirm

Authored path: `OpenTime.Gatherings.Confirm`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 13.

```reaction
when RequestBoundary.request (expectedAttendees, gathering, path: "/gatherings/confirm", requestId, session, version)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Confirm#2

Authored path: `OpenTime.Gatherings.Confirm`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 13.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Confirm
where
  earlier, RequestBoundary.request (expectedAttendees, gathering, path: "/gatherings/confirm", requestId, session, version)
then
  Gathering.confirm (expectedAttendees, gathering, user, version)
```

### OpenTime.Gatherings.Confirm#3

Authored path: `OpenTime.Gatherings.Confirm`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 13.

```reaction
when Gathering.confirm (expectedAttendees, gathering, user, version, attendees), asked by OpenTime.Gatherings.Confirm#2
where
  earlier, RequestBoundary.request (expectedAttendees, gathering, path: "/gatherings/confirm", requestId, session, version)
then
  RequestBoundary.respond (attendees, requestId)
```

### OpenTime.Gatherings.Decline

Authored path: `OpenTime.Gatherings.Decline`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 12.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/decline", requestId, session, version)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Decline#2

Authored path: `OpenTime.Gatherings.Decline`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 12.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Decline
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/decline", requestId, session, version)
then
  Gathering.decline (gathering, user, version)
```

### OpenTime.Gatherings.Decline#3

Authored path: `OpenTime.Gatherings.Decline`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 12.

```reaction
when Gathering.decline (gathering, user, version), asked by OpenTime.Gatherings.Decline#2
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/decline", requestId, session, version)
then
  RequestBoundary.respond (declined: true, requestId)
```

### OpenTime.Gatherings.Edit

Authored path: `OpenTime.Gatherings.Edit`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 10.

```reaction
when RequestBoundary.request (activity, end, expectedVersion, gathering, path: "/gatherings/edit", place, purpose, requestId, session, start)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Edit#2

Authored path: `OpenTime.Gatherings.Edit`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 10.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Edit
where
  earlier, RequestBoundary.request (activity, end, expectedVersion, gathering, path: "/gatherings/edit", place, purpose, requestId, session, start)
then
  Gathering.edit (activity, end, expectedVersion, gathering, place, purpose, start, user)
```

### OpenTime.Gatherings.Edit#3

Authored path: `OpenTime.Gatherings.Edit`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 10.

```reaction
when Gathering.edit (activity, end, expectedVersion, gathering, place, purpose, start, user, affectedUsers, version), asked by OpenTime.Gatherings.Edit#2
where
  earlier, RequestBoundary.request (activity, end, expectedVersion, gathering, path: "/gatherings/edit", place, purpose, requestId, session, start)
then
  RequestBoundary.respond (requestId, version)
```

### OpenTime.Gatherings.Get

Authored path: `OpenTime.Gatherings.Get`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 17.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/get", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Get:outsider#2

Authored path: `OpenTime.Gatherings.Get`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 17.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Get
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/get", requestId, session)
  Gathering._visibleTo (gathering, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GATHERING_FORBIDDEN", requestId)
```

### OpenTime.Gatherings.Get:participant#2

Authored path: `OpenTime.Gatherings.Get`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 17.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Get
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/get", requestId, session)
  Gathering._visibleTo (gathering, user) has (allowed: true)
  Gathering._get (gathering) has (accepted, activity, attendees, context, end, invitees, organizer, place, purpose, start, status, version)
then
  RequestBoundary.respond (accepted, activity, attendees, context, end, gathering, invitees, organizer, place, purpose, requestId, start, status, version)
```

### OpenTime.Gatherings.Invite

Authored path: `OpenTime.Gatherings.Invite`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 9.

```reaction
when RequestBoundary.request (gathering, invitee, path: "/gatherings/invite", requestId, session, version)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Invite:eligible#2

Authored path: `OpenTime.Gatherings.Invite`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Invite
where
  earlier, RequestBoundary.request (gathering, invitee, path: "/gatherings/invite", requestId, session, version)
  Gathering._contextFor (gathering) has (context)
  Grouping._canInviteToGathering (group: context, invitee, user) has (allowed: true)
then
  Gathering.invite (gathering, invitee, user, version)
```

### OpenTime.Gatherings.Invite:eligible#3

Authored path: `OpenTime.Gatherings.Invite`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 9.

```reaction
when Gathering.invite (gathering, invitee, user, version), asked by OpenTime.Gatherings.Invite:eligible#2
where
  earlier, RequestBoundary.request (gathering, invitee, path: "/gatherings/invite", requestId, session, version)
then
  RequestBoundary.respond (invited: true, requestId)
```

### OpenTime.Gatherings.Invite:ineligible#2

Authored path: `OpenTime.Gatherings.Invite`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Invite
where
  earlier, RequestBoundary.request (gathering, invitee, path: "/gatherings/invite", requestId, session, version)
  Gathering._contextFor (gathering) has (context)
  Grouping._canInviteToGathering (group: context, invitee, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Gatherings.List

Authored path: `OpenTime.Gatherings.List`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 16.

```reaction
when RequestBoundary.request (path: "/gatherings/list", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.List#2

Authored path: `OpenTime.Gatherings.List`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 16.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.List
where
  Gathering._listFor (user) has (gatherings)
  earlier, RequestBoundary.request (path: "/gatherings/list", requestId, session)
then
  RequestBoundary.respond (gatherings, requestId)
```

### OpenTime.Gatherings.Propose

Authored path: `OpenTime.Gatherings.Propose`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 8.

```reaction
when RequestBoundary.request (activity, end, group, invitees, path: "/gatherings/propose", place, purpose, requestId, session, start)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Propose:eligible#2

Authored path: `OpenTime.Gatherings.Propose`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 8.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Propose
where
  earlier, RequestBoundary.request (activity, end, group, invitees, path: "/gatherings/propose", place, purpose, requestId, session, start)
  Grouping._canPlanWith (group, invitees, user) has (allowed: true)
then
  Gathering.propose (activity, context: group, end, invitees, organizer: user, place, purpose, start)
```

### OpenTime.Gatherings.Propose:eligible#3

Authored path: `OpenTime.Gatherings.Propose`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 8.

```reaction
when Gathering.propose (activity, context: group, end, invitees, organizer: user, place, purpose, start, gathering, version), asked by OpenTime.Gatherings.Propose:eligible#2
where
  earlier, RequestBoundary.request (activity, end, group, invitees, path: "/gatherings/propose", place, purpose, requestId, session, start)
then
  RequestBoundary.respond (gathering, requestId, version)
```

### OpenTime.Gatherings.Propose:ineligible#2

Authored path: `OpenTime.Gatherings.Propose`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 8.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Propose
where
  earlier, RequestBoundary.request (activity, end, group, invitees, path: "/gatherings/propose", place, purpose, requestId, session, start)
  Grouping._canPlanWith (group, invitees, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Gatherings.Withdraw

Authored path: `OpenTime.Gatherings.Withdraw`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 14.

```reaction
when RequestBoundary.request (gathering, path: "/gatherings/withdraw", requestId, session, version)
then
  Authenticating.authenticate (session)
```

### OpenTime.Gatherings.Withdraw#2

Authored path: `OpenTime.Gatherings.Withdraw`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 14.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Gatherings.Withdraw
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/withdraw", requestId, session, version)
then
  Gathering.withdraw (gathering, user, version)
```

### OpenTime.Gatherings.Withdraw#3

Authored path: `OpenTime.Gatherings.Withdraw`.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 5.
- Covered by [Gatherings composition](../design/compositions/Gatherings.md), line 14.

```reaction
when Gathering.withdraw (gathering, user, version, affectedUsers, status), asked by OpenTime.Gatherings.Withdraw#2
where
  earlier, RequestBoundary.request (gathering, path: "/gatherings/withdraw", requestId, session, version)
then
  RequestBoundary.respond (requestId, status)
```

### OpenTime.Groups.Accept

Authored path: `OpenTime.Groups.Accept`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 10.

```reaction
when RequestBoundary.request (group, path: "/groups/accept", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Accept#2

Authored path: `OpenTime.Groups.Accept`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 10.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Accept
where
  earlier, RequestBoundary.request (group, path: "/groups/accept", requestId, session)
then
  Grouping.accept (group, user)
```

### OpenTime.Groups.Accept#3

Authored path: `OpenTime.Groups.Accept`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 10.

```reaction
when Grouping.accept (group, user), asked by OpenTime.Groups.Accept#2
where
  earlier, RequestBoundary.request (group, path: "/groups/accept", requestId, session)
then
  RequestBoundary.respond (accepted: true, requestId)
```

### OpenTime.Groups.Close

Authored path: `OpenTime.Groups.Close`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 18.

```reaction
when RequestBoundary.request (group, path: "/groups/close", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Close#2

Authored path: `OpenTime.Groups.Close`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 18.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Close
where
  earlier, RequestBoundary.request (group, path: "/groups/close", requestId, session)
then
  Grouping.close (group, user)
```

### OpenTime.Groups.Close#3

Authored path: `OpenTime.Groups.Close`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 18.

```reaction
when Grouping.close (group, user), asked by OpenTime.Groups.Close#2
where
  earlier, RequestBoundary.request (group, path: "/groups/close", requestId, session)
then
  RequestBoundary.respond (closed: true, requestId)
```

### OpenTime.Groups.Create

Authored path: `OpenTime.Groups.Create`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 8.

```reaction
when RequestBoundary.request (name, path: "/groups/create", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Create#2

Authored path: `OpenTime.Groups.Create`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 8.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Create
where
  earlier, RequestBoundary.request (name, path: "/groups/create", requestId, session)
then
  Grouping.create (name, owner: user)
```

### OpenTime.Groups.Create#3

Authored path: `OpenTime.Groups.Create`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 8.

```reaction
when Grouping.create (name, owner: user, group), asked by OpenTime.Groups.Create#2
where
  earlier, RequestBoundary.request (name, path: "/groups/create", requestId, session)
then
  RequestBoundary.respond (group, requestId)
```

### OpenTime.Groups.Decline

Authored path: `OpenTime.Groups.Decline`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 11.

```reaction
when RequestBoundary.request (group, path: "/groups/decline", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Decline#2

Authored path: `OpenTime.Groups.Decline`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 11.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Decline
where
  earlier, RequestBoundary.request (group, path: "/groups/decline", requestId, session)
then
  Grouping.decline (group, user)
```

### OpenTime.Groups.Decline#3

Authored path: `OpenTime.Groups.Decline`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 11.

```reaction
when Grouping.decline (group, user), asked by OpenTime.Groups.Decline#2
where
  earlier, RequestBoundary.request (group, path: "/groups/decline", requestId, session)
then
  RequestBoundary.respond (declined: true, requestId)
```

### OpenTime.Groups.Invite

Authored path: `OpenTime.Groups.Invite`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 9.

```reaction
when RequestBoundary.request (group, path: "/groups/invite", requestId, session, username)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Invite:account-exists#2

Authored path: `OpenTime.Groups.Invite`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Invite
where
  earlier, RequestBoundary.request (group, path: "/groups/invite", requestId, session, username)
  Authenticating._byUsername (username) has (user: invitee)
then
  Grouping.invite (group, invitee, user)
```

### OpenTime.Groups.Invite:account-exists#3

Authored path: `OpenTime.Groups.Invite`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 9.

```reaction
when Grouping.invite (group, invitee, user), asked by OpenTime.Groups.Invite:account-exists#2
where
  earlier, RequestBoundary.request (group, path: "/groups/invite", requestId, session, username)
then
  RequestBoundary.respond (invited: true, requestId)
```

### OpenTime.Groups.Invite:account-missing#2

Authored path: `OpenTime.Groups.Invite`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Invite
where
  earlier, RequestBoundary.request (group, path: "/groups/invite", requestId, session, username)
  no Authenticating._byUsername (username)
then
  RequestBoundary.respond (error: "GROUP_NOT_FOUND", requestId)
```

### OpenTime.Groups.Join

Authored path: `OpenTime.Groups.Join`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 12.

```reaction
when RequestBoundary.request (path: "/groups/join", requestId, session, url)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Join#2

Authored path: `OpenTime.Groups.Join`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 12.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Join
where
  earlier, RequestBoundary.request (path: "/groups/join", requestId, session, url)
then
  Grouping.join (url, user)
```

### OpenTime.Groups.Join#3

Authored path: `OpenTime.Groups.Join`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 12.

```reaction
when Grouping.join (url, user, group), asked by OpenTime.Groups.Join#2
where
  earlier, RequestBoundary.request (path: "/groups/join", requestId, session, url)
then
  RequestBoundary.respond (group, requestId)
```

### OpenTime.Groups.Leave

Authored path: `OpenTime.Groups.Leave`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 16.

```reaction
when RequestBoundary.request (group, path: "/groups/leave", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Leave#2

Authored path: `OpenTime.Groups.Leave`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 16.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Leave
where
  earlier, RequestBoundary.request (group, path: "/groups/leave", requestId, session)
then
  Grouping.leave (group, user)
```

### OpenTime.Groups.Leave#3

Authored path: `OpenTime.Groups.Leave`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 16.

```reaction
when Grouping.leave (group, user), asked by OpenTime.Groups.Leave#2
where
  earlier, RequestBoundary.request (group, path: "/groups/leave", requestId, session)
then
  RequestBoundary.respond (left: true, requestId)
```

### OpenTime.Groups.Link

Authored path: `OpenTime.Groups.Link`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 15.

```reaction
when RequestBoundary.request (group, path: "/groups/link", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Link:group-missing#2

Authored path: `OpenTime.Groups.Link`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 15.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Link
where
  earlier, RequestBoundary.request (group, path: "/groups/link", requestId, session)
  no Grouping._getGroup (group)
then
  RequestBoundary.respond (error: "GROUP_NOT_FOUND", requestId)
```

### OpenTime.Groups.Link:not-owner#2

Authored path: `OpenTime.Groups.Link`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 15.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Link
where
  earlier, RequestBoundary.request (group, path: "/groups/link", requestId, session)
  Grouping._getGroup (group)
  no Grouping._getGroup (group) has (owner: user, status: "ACTIVE")
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Groups.Link:owner#2

Authored path: `OpenTime.Groups.Link`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 15.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Link
where
  earlier, RequestBoundary.request (group, path: "/groups/link", requestId, session)
  Grouping._getGroup (group) has (owner: user, status: "ACTIVE")
  Grouping._joinUrl (group) has (url)
then
  RequestBoundary.respond (requestId, url)
```

### OpenTime.Groups.List

Authored path: `OpenTime.Groups.List`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 13.

```reaction
when RequestBoundary.request (path: "/groups/list", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.List#2

Authored path: `OpenTime.Groups.List`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 13.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.List
where
  Grouping._visibleFor (user) has (groups)
  earlier, RequestBoundary.request (path: "/groups/list", requestId, session)
then
  RequestBoundary.respond (groups, requestId)
```

### OpenTime.Groups.Members

Authored path: `OpenTime.Groups.Members`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 14.

```reaction
when RequestBoundary.request (group, path: "/groups/members", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Members:member#2

Authored path: `OpenTime.Groups.Members`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 14.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Members
where
  earlier, RequestBoundary.request (group, path: "/groups/members", requestId, session)
  Grouping._accessFor (group, user) has (allowed: true, members)
  Authenticating._usernames (users: members) has (accounts)
then
  RequestBoundary.respond (accounts, requestId)
```

### OpenTime.Groups.Members:not-member#2

Authored path: `OpenTime.Groups.Members`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 14.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Members
where
  earlier, RequestBoundary.request (group, path: "/groups/members", requestId, session)
  Grouping._accessFor (group, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Groups.Remove

Authored path: `OpenTime.Groups.Remove`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 17.

```reaction
when RequestBoundary.request (group, path: "/groups/remove", requestId, session, username)
then
  Authenticating.authenticate (session)
```

### OpenTime.Groups.Remove:account-exists#2

Authored path: `OpenTime.Groups.Remove`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 17.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Remove
where
  earlier, RequestBoundary.request (group, path: "/groups/remove", requestId, session, username)
  Authenticating._byUsername (username) has (user: member)
then
  Grouping.remove (group, member, user)
```

### OpenTime.Groups.Remove:account-exists#3

Authored path: `OpenTime.Groups.Remove`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 17.

```reaction
when Grouping.remove (group, member, user), asked by OpenTime.Groups.Remove:account-exists#2
where
  earlier, RequestBoundary.request (group, path: "/groups/remove", requestId, session, username)
then
  RequestBoundary.respond (removed: true, requestId)
```

### OpenTime.Groups.Remove:account-missing#2

Authored path: `OpenTime.Groups.Remove`.
- Covered by [Groups composition](../design/compositions/Groups.md), line 5.
- Covered by [Groups composition](../design/compositions/Groups.md), line 17.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Groups.Remove
where
  earlier, RequestBoundary.request (group, path: "/groups/remove", requestId, session, username)
  no Authenticating._byUsername (username)
then
  RequestBoundary.respond (error: "GROUP_NOT_FOUND", requestId)
```

### OpenTime.Notices.List

Authored path: `OpenTime.Notices.List`.
- Covered by [Notices composition](../design/compositions/Notices.md), line 5.
- Covered by [Notices composition](../design/compositions/Notices.md), line 8.

```reaction
when RequestBoundary.request (path: "/notices/list", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Notices.List#2

Authored path: `OpenTime.Notices.List`.
- Covered by [Notices composition](../design/compositions/Notices.md), line 5.
- Covered by [Notices composition](../design/compositions/Notices.md), line 8.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Notices.List
where
  Notifying._inbox (user) has (notices)
  earlier, RequestBoundary.request (path: "/notices/list", requestId, session)
then
  RequestBoundary.respond (notices, requestId)
```

### OpenTime.Notices.MarkRead

Authored path: `OpenTime.Notices.MarkRead`.
- Covered by [Notices composition](../design/compositions/Notices.md), line 5.
- Covered by [Notices composition](../design/compositions/Notices.md), line 9.

```reaction
when RequestBoundary.request (notice, path: "/notices/mark-read", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Notices.MarkRead#2

Authored path: `OpenTime.Notices.MarkRead`.
- Covered by [Notices composition](../design/compositions/Notices.md), line 5.
- Covered by [Notices composition](../design/compositions/Notices.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Notices.MarkRead
where
  earlier, RequestBoundary.request (notice, path: "/notices/mark-read", requestId, session)
then
  Notifying.markRead (notice, user)
```

### OpenTime.Notices.MarkRead#3

Authored path: `OpenTime.Notices.MarkRead`.
- Covered by [Notices composition](../design/compositions/Notices.md), line 5.
- Covered by [Notices composition](../design/compositions/Notices.md), line 9.

```reaction
when Notifying.markRead (notice, user), asked by OpenTime.Notices.MarkRead#2
where
  earlier, RequestBoundary.request (notice, path: "/notices/mark-read", requestId, session)
then
  RequestBoundary.respond (markedRead: true, requestId)
```

### OpenTime.Openings.Create

Authored path: `OpenTime.Openings.Create`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 8.

```reaction
when RequestBoundary.request (end, path: "/openings/create", requestId, session, start)
then
  Authenticating.authenticate (session)
```

### OpenTime.Openings.Create#2

Authored path: `OpenTime.Openings.Create`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 8.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Create
where
  earlier, RequestBoundary.request (end, path: "/openings/create", requestId, session, start)
then
  AvailabilitySharing.create (end, owner: user, start)
```

### OpenTime.Openings.Create#3

Authored path: `OpenTime.Openings.Create`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 8.

```reaction
when AvailabilitySharing.create (end, owner: user, start, opening), asked by OpenTime.Openings.Create#2
where
  earlier, RequestBoundary.request (end, path: "/openings/create", requestId, session, start)
then
  RequestBoundary.respond (opening, requestId)
```

### OpenTime.Openings.FindOverlap

Authored path: `OpenTime.Openings.FindOverlap`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 13.

```reaction
when RequestBoundary.request (duration, from, group, path: "/openings/overlap", requestId, session, to)
then
  Authenticating.authenticate (session)
```

### OpenTime.Openings.FindOverlap:member#2

Authored path: `OpenTime.Openings.FindOverlap`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 13.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.FindOverlap
where
  instant is the current flow's instant
  earlier, RequestBoundary.request (duration, from, group, path: "/openings/overlap", requestId, session, to)
  AvailabilitySharing._overlapSnapshot (duration, from, group, now: instant, to, user) has (allowed: true, overlaps, suggestions)
then
  RequestBoundary.respond (overlaps, requestId, suggestions)
```

### OpenTime.Openings.FindOverlap:not-member#2

Authored path: `OpenTime.Openings.FindOverlap`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 13.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.FindOverlap
where
  instant is the current flow's instant
  earlier, RequestBoundary.request (duration, from, group, path: "/openings/overlap", requestId, session, to)
  AvailabilitySharing._overlapSnapshot (duration, from, group, now: instant, to, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Openings.Mine

Authored path: `OpenTime.Openings.Mine`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 12.

```reaction
when RequestBoundary.request (path: "/openings/mine", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Openings.Mine#2

Authored path: `OpenTime.Openings.Mine`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 12.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Mine
where
  AvailabilitySharing._ownedSnapshot (user) has (openings)
  earlier, RequestBoundary.request (path: "/openings/mine", requestId, session)
then
  RequestBoundary.respond (openings, requestId)
```

### OpenTime.Openings.Publish

Authored path: `OpenTime.Openings.Publish`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 9.

```reaction
when RequestBoundary.request (audiences, opening, path: "/openings/publish", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Openings.Publish:allowed#2

Authored path: `OpenTime.Openings.Publish`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Publish
where
  earlier, RequestBoundary.request (audiences, opening, path: "/openings/publish", requestId, session)
  Grouping._canShareWith (groups: audiences, user) has (allowed: true)
then
  AvailabilitySharing.publish (audiences, opening, user)
```

### OpenTime.Openings.Publish:allowed#3

Authored path: `OpenTime.Openings.Publish`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 9.

```reaction
when AvailabilitySharing.publish (audiences, opening, user), asked by OpenTime.Openings.Publish:allowed#2
where
  earlier, RequestBoundary.request (audiences, opening, path: "/openings/publish", requestId, session)
then
  RequestBoundary.respond (published: true, requestId)
```

### OpenTime.Openings.Publish:not-member#2

Authored path: `OpenTime.Openings.Publish`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 9.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Publish
where
  earlier, RequestBoundary.request (audiences, opening, path: "/openings/publish", requestId, session)
  Grouping._canShareWith (groups: audiences, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Openings.Revise

Authored path: `OpenTime.Openings.Revise`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 10.

```reaction
when RequestBoundary.request (audiences, end, opening, path: "/openings/revise", requestId, session, start)
then
  Authenticating.authenticate (session)
```

### OpenTime.Openings.Revise:allowed#2

Authored path: `OpenTime.Openings.Revise`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 10.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Revise
where
  earlier, RequestBoundary.request (audiences, end, opening, path: "/openings/revise", requestId, session, start)
  Grouping._canShareWith (groups: audiences, user) has (allowed: true)
then
  AvailabilitySharing.revise (audiences, end, opening, start, user)
```

### OpenTime.Openings.Revise:allowed#3

Authored path: `OpenTime.Openings.Revise`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 10.

```reaction
when AvailabilitySharing.revise (audiences, end, opening, start, user), asked by OpenTime.Openings.Revise:allowed#2
where
  earlier, RequestBoundary.request (audiences, end, opening, path: "/openings/revise", requestId, session, start)
then
  RequestBoundary.respond (requestId, revised: true)
```

### OpenTime.Openings.Revise:not-member#2

Authored path: `OpenTime.Openings.Revise`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 10.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Revise
where
  earlier, RequestBoundary.request (audiences, end, opening, path: "/openings/revise", requestId, session, start)
  Grouping._canShareWith (groups: audiences, user) has (allowed: false)
then
  RequestBoundary.respond (error: "GROUP_FORBIDDEN", requestId)
```

### OpenTime.Openings.Withdraw

Authored path: `OpenTime.Openings.Withdraw`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 11.

```reaction
when RequestBoundary.request (opening, path: "/openings/withdraw", requestId, session)
then
  Authenticating.authenticate (session)
```

### OpenTime.Openings.Withdraw#2

Authored path: `OpenTime.Openings.Withdraw`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 11.

```reaction
when Authenticating.authenticate (session, user), asked by OpenTime.Openings.Withdraw
where
  earlier, RequestBoundary.request (opening, path: "/openings/withdraw", requestId, session)
then
  AvailabilitySharing.withdraw (opening, user)
```

### OpenTime.Openings.Withdraw#3

Authored path: `OpenTime.Openings.Withdraw`.
- Covered by [Openings composition](../design/compositions/Openings.md), line 5.
- Covered by [Openings composition](../design/compositions/Openings.md), line 11.

```reaction
when AvailabilitySharing.withdraw (opening, user), asked by OpenTime.Openings.Withdraw#2
where
  earlier, RequestBoundary.request (opening, path: "/openings/withdraw", requestId, session)
then
  RequestBoundary.respond (requestId, withdrawn: true)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/auth/current` — requires `session`
- `/auth/register` — requires `username`, `password`
- `/auth/sign-in` — requires `username`, `password`
- `/auth/sign-out` — requires `session`
- `/gatherings/accept` — requires `session`, `gathering`, `version`
- `/gatherings/cancel` — requires `session`, `gathering`, `version`
- `/gatherings/confirm` — requires `session`, `gathering`, `version`, `expectedAttendees`
- `/gatherings/decline` — requires `session`, `gathering`, `version`
- `/gatherings/edit` — requires `session`, `gathering`, `expectedVersion`, `purpose`, `activity`, `place`, `start`, `end`
- `/gatherings/get` — requires `session`, `gathering`
- `/gatherings/invite` — requires `session`, `gathering`, `version`, `invitee`
- `/gatherings/list` — requires `session`
- `/gatherings/propose` — requires `session`, `group`, `invitees`, `purpose`, `activity`, `place`, `start`, `end`
- `/gatherings/withdraw` — requires `session`, `gathering`, `version`
- `/groups/accept` — requires `session`, `group`
- `/groups/close` — requires `session`, `group`
- `/groups/create` — requires `session`, `name`
- `/groups/decline` — requires `session`, `group`
- `/groups/invite` — requires `session`, `group`, `username`
- `/groups/join` — requires `session`, `url`
- `/groups/leave` — requires `session`, `group`
- `/groups/link` — requires `session`, `group`
- `/groups/list` — requires `session`
- `/groups/members` — requires `session`, `group`
- `/groups/remove` — requires `session`, `group`, `username`
- `/notices/list` — requires `session`
- `/notices/mark-read` — requires `session`, `notice`
- `/openings/create` — requires `session`, `start`, `end`
- `/openings/mine` — requires `session`
- `/openings/overlap` — requires `session`, `group`, `from`, `to`, `duration`
- `/openings/publish` — requires `session`, `opening`, `audiences`
- `/openings/revise` — requires `session`, `opening`, `start`, `end`, `audiences`
- `/openings/withdraw` — requires `session`, `opening`
