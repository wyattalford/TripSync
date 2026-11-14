# OpenTime: Concept Design

## Authenticating

```text
concept Authenticating

purpose establish a user's identity so actions can be attributed to
  the correct account

principle a user registers a unique username and password. Matching
  credentials allow them to sign in and receive a session, and that session
  identifies the user until they sign out, after which it cannot
  authenticate further requests.

state
  a set of Users with
    a unique username String
    a passwordVerifier String

  a set of Sessions with
    a user User

actions
  register (username: String, password: String) : return (user: User)
    where username and password are not blank,
      and no user has the given username
    then
      create user with the given username and a securely derived
        passwordVerifier for the supplied password
      return user

  signIn (username: String, password: String)
    : return (session: Session)
    where a user has the given username,
      and password matches that user's passwordVerifier
    then
      create a new session associated with that user
      return session

  authenticate (session: Session) : return (user: User)
    where session exists
    then
      return the user associated with session

  signOut (session: Session) : return ()
    where session exists
    then
      remove session
      return

queries
  _exists (user: User) : one (exists: Flag)
    Returns whether user exists.
```

**Notes.** Users and Sessions are introduced by this concept's state, so they do not need external type declarations. Session identifiers are virtually unguessable, and password verifiers do not store plaintext passwords. OpenTime binds the external User types in its other concepts to Authenticating's User. Application reactions authenticate requests and check the resulting user's role before invoking protected actions.

## Grouping

```text
concept Grouping

purpose maintain a shared, consensual record of who belongs to a group

principle a user creates a group and becomes its owner and first member.
  The owner invites others, who become members only by accepting.
  Members may leave, and the owner may remove members or close the group.
  An invitation alone does not establish membership.

types
  external User
  GroupStatus is ACTIVE or CLOSED
  MembershipStatus is PENDING or MEMBER or DECLINED or LEFT or REMOVED

state
  a set of Groups with
    an owner User
    a name String
    a status GroupStatus

  a set of Memberships with
    a group Group
    a user User
    a status MembershipStatus
    unique group and user

  Rule: Each group's owner has a MEMBER membership in that group.
    Ownership is fixed.

actions
  create (owner: User, name: String) : return (group: Group)
    where name is not blank
    then
      create group with the supplied owner and name, and status ACTIVE
      create a MEMBER membership for owner in group
      return group

  invite (user: User, group: Group, invitee: User) : return ()
    where group is ACTIVE and user is its owner,
      invitee differs from user,
      and either invitee has no membership in group,
        or invitee's membership has status DECLINED, LEFT, or REMOVED
    then
      create invitee's membership if absent
      set its status to PENDING
      return

  accept (user: User, group: Group) : return ()
    where group is ACTIVE and user's membership is PENDING
    then
      set user's membership to MEMBER
      return

  decline (user: User, group: Group) : return ()
    where group is ACTIVE and user's membership is PENDING
    then
      set user's membership to DECLINED
      return

  leave (user: User, group: Group) : return ()
    where group is ACTIVE, user's membership is MEMBER,
      and user is not its owner
    then
      set user's membership to LEFT
      return

  remove (user: User, group: Group, member: User) : return ()
    where group is ACTIVE and user is its owner,
      member differs from user,
      and member's membership is PENDING or MEMBER
    then
      set member's membership to REMOVED
      return

  close (user: User, group: Group) : return ()
    where group is ACTIVE and user is its owner
    then
      set group's status to CLOSED
      return

queries
  _getGroup (group: Group)
    : optional (owner: User, name: String, status: GroupStatus,
      members: set of User)
    Returns the group's owner, name, status, and users whose
      memberships are MEMBER; no row if group does not exist.

  _membership (user: User, group: Group)
    : optional (status: MembershipStatus)
    Returns the user's membership status; no row if absent.

  _groupsFor (user: User) : many (group: Group)
    Returns active groups in which user is a MEMBER, in unspecified order.
```

**Notes.** Grouping owns membership, not openings or gatherings. Pending invitees may view their invitation but cannot access group overlaps. Reactions check active membership before using shared openings or creating a gathering for a group. Leaving, removal, or closure stops this access without deleting a person's openings. Existing gathering invitations and commitments remain accessible to their participants until explicitly withdrawn or cancelled. The owner closes the group rather than leaving it ownerless because ownership transfer is outside the initial scope.

## AvailabilitySharing

```text
concept AvailabilitySharing

purpose communicate when invitations for a particular purpose are welcome
  to selected audiences

principle a user creates a dated opening, gives it a purpose, and publishes it
  to select audiences that may use it. The user can revise or withdraw
  that opening. One record serves all selected audiences, and an opening
  stops contributing after its end time. Sharing an opening does not
  commit its owner to a particular invitation.

types
  external User
  external Audience

state
  a set of Openings with
    an owner User
    a purpose String
    a start DateTime
    an end DateTime
    an audiences set of Audience

  Rule: Each opening has start before end, a nonblank purpose,
    and do not conflict with each other.

actions
  create (owner: User, purpose: String, start: DateTime, end: DateTime) : return (opening: Opening)
    where purpose is not blank, start is before end, end is in the future, and interval does not conflict with user's existing openings
    then
      create opening with the supplied owner, purpose, interval, and an empty audience
      return opening

  publish (user: User, opening: Opening, audiences: set of Audience) : return ()
    where opening exists with owner user
    then
      share opening with the audiences
      return

  revise (user: User, opening: Opening, purpose: String,
    start: DateTime, end: DateTime, audiences: set of Audience)
    : return ()
    where opening exists with owner user and has not ended,
      purpose is not blank, start is before end, end is in the future,
      and at least one supplied value differs from its recorded value
    then
      set opening's purpose, start, end, and audiences to the supplied values
      return

  withdraw (user: User, opening: Opening) : return ()
    where opening exists with owner user
    then
      remove opening
      return

queries
  _owned (user: User) : many (opening: Opening, purpose: String,
    start: DateTime, end: DateTime, audiences: set of Audience)
    Returns user's openings, including ended openings, ordered by start
      and then end. Ties have unspecified order; no rows if absent.

  _sharedWith (audience: Audience, purpose: String,
    from: DateTime, to: DateTime)
    : many (owner: User, start: DateTime, end: DateTime)
    Returns intervals of openings that include audience, match purpose,
      have not ended, and intersect [from, to). Each interval is clipped
      to that range and the current time. Returns no rows for an empty
      or reversed range. Row order is unspecified.
```

**Notes.** In OpenTime, Audience is bound to Grouping's Group. Only the owner sees an opening's individual details and selected audiences. Other members receive calculated group overlaps through authorized reactions. A changed audience set replaces the previous set and withdrawing removes the opening from every audience. Renewing an ended opening means publishing a new dated opening, so old willingness is not assumed to continue. Purpose values use consistent application labels such as dinner, studying, or watching a movie. The MVP uses dated intervals rather than recurring schedules or calendar imports for the initial implementation.

All intervals use [start, end): an interval ending at 7 PM does not conflict with one starting at 7 PM. DateTime values represent absolute instants and are displayed in the user's local time. Overlapping openings with the same purpose are combined when calculating coverage. All time checks use the system clock. These interval conventions also apply to Gathering and the reactions below.

## Gathering

```text
concept Gathering

purpose establish a definite arrangement among people who explicitly
  agree to attend

principle an organizer proposes details, which counts as their acceptance.
  Invitees accept or decline the current version, and the organizer
  confirms it for the accepted participants. More people may be invited
  after confirmation, and accepting joins them to the existing arrangement.
  Editing creates a new version requiring fresh acceptance. An attendee
  may withdraw, and the organizer may cancel. A confirmed gathering
  closes when its last non-organizer attendee withdraws and no pending
  invitations remain for the current version.

types
  external User
  external Context
  GatheringStatus is PROPOSED or CONFIRMED or CANCELLED
  ResponseStatus is PENDING or ACCEPTED or DECLINED or WITHDRAWN

state
  a set of Gatherings with
    an organizer User
    a context Context
    a status GatheringStatus
    a currentVersion Version
    an attendees set of User

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

  Rule: A gathering's organizer and context are fixed. Its currentVersion
    is its latest version. Version contents are immutable and earlier
    versions and their responses are retained.

  Rule: Each version has an ACCEPTED response from its gathering's
    organizer. Responses authorize only their own version.

  Rule: A CONFIRMED gathering's attendees are exactly the users with
    ACCEPTED responses to its currentVersion and include its organizer.
    Other gatherings have no attendees.

  Rule: A user cannot be an attendee of overlapping CONFIRMED gatherings,
    using each gathering's current version's interval.

actions
  propose (organizer: User, context: Context, invitees: set of User,
    purpose: String, activity: String, place: String,
    start: DateTime, end: DateTime)
    : return (gathering: Gathering, version: Version)
    where invitees is not empty and excludes organizer,
      purpose, activity, and place are not blank,
      the current time is before start and start is before end,
      and organizer attends no CONFIRMED gathering overlapping [start, end)
    then
      create gathering with organizer, context, status PROPOSED,
        and no attendees
      create version for gathering with number 1 and all supplied details
      set gathering's currentVersion to version
      create an ACCEPTED response to version for organizer
      create a PENDING response to version for each invitee
      return gathering, version

  invite (user: User, gathering: Gathering, version: Version,
    invitee: User) : return ()
    where gathering is PROPOSED or CONFIRMED,
      user is its organizer, version is its currentVersion,
      version has not started, invitee differs from user,
      and invitee has no response to version or has a response
        with status DECLINED or WITHDRAWN
    then
      create invitee's response to version if absent
      set that response's status to PENDING
      return

  edit (user: User, gathering: Gathering, expectedVersion: Version,
    purpose: String, activity: String, place: String,
    start: DateTime, end: DateTime)
    : return (version: Version, affectedUsers: set of User)
    where gathering is PROPOSED or CONFIRMED,
      user is its organizer, expectedVersion is its currentVersion,
      expectedVersion has not started,
      purpose, activity, and place are not blank,
      the current time is before start and start is before end,
      at least one detail differs from expectedVersion,
      and organizer attends no other CONFIRMED gathering
        overlapping [start, end)
    then
      let affectedUsers be all response users for expectedVersion
        excluding organizer
      create version for gathering with number expectedVersion.number + 1
        and all supplied details
      create an ACCEPTED response to version for organizer
      create a PENDING response to version for each affected user
      set gathering's currentVersion to version and status to PROPOSED
      clear its attendees
      return version, affectedUsers

  accept (user: User, gathering: Gathering, version: Version)
    : return (joined: Flag, affectedUsers: set of User)
    where gathering is PROPOSED or CONFIRMED,
      version is its currentVersion and has not started,
      user's response to version is PENDING, DECLINED, or WITHDRAWN,
      and user attends no other CONFIRMED gathering
        overlapping version's interval
    then
      set user's response to version to ACCEPTED
      if gathering is CONFIRMED,
        let affectedUsers be its existing attendees
        add user to its attendees and set joined to true
      otherwise let affectedUsers be the singleton set containing
        organizer and set joined to false
      return joined, affectedUsers

  decline (user: User, gathering: Gathering, version: Version)
    : return ()
    where gathering is PROPOSED or CONFIRMED,
      version is its currentVersion and has not started,
      and user's response to version is PENDING
    then
      set user's response to version to DECLINED
      return

  confirm (user: User, gathering: Gathering, version: Version,
    expectedAttendees: set of User) : return (attendees: set of User)
    where gathering is PROPOSED, user is its organizer,
      version is its currentVersion and has not started,
      expectedAttendees is exactly version's users with ACCEPTED responses,
      expectedAttendees includes at least one user besides organizer,
      and no user in expectedAttendees attends another CONFIRMED
        gathering overlapping version's interval
    then
      set gathering's status to CONFIRMED
      set its attendees to expectedAttendees
      return expectedAttendees as attendees

  withdraw (user: User, gathering: Gathering, version: Version)
    : return (affectedUsers: set of User, status: GatheringStatus)
    where gathering is PROPOSED or CONFIRMED,
      version is its currentVersion and has not started,
      user is not its organizer,
      and user's response to version is ACCEPTED
    then
      set user's response to version to WITHDRAWN
      if gathering is PROPOSED,
        let affectedUsers be the singleton set containing organizer
      otherwise
        remove user from its attendees
        if its attendees now contain only organizer
          and no response to version has status PENDING,
          set gathering's status to CANCELLED and clear its attendees
          let affectedUsers be all response users for version excluding user
        otherwise let affectedUsers be its remaining attendees
      return affectedUsers, gathering's status as status

  cancel (user: User, gathering: Gathering, version: Version)
    : return (affectedUsers: set of User)
    where gathering is PROPOSED or CONFIRMED,
      user is its organizer,
      and version is its currentVersion and has not started
    then
      let affectedUsers be all response users for version excluding user
      set gathering's status to CANCELLED and clear its attendees
      return affectedUsers

queries
  _get (gathering: Gathering) : optional (organizer: User,
    context: Context, version: Version, purpose: String, activity: String,
    place: String, start: DateTime, end: DateTime, status: GatheringStatus,
    invitees: set of User, accepted: set of User, attendees: set of User)
    Returns gathering's organizer, context, currentVersion as version,
      that version's details, gathering's status and attendees,
      current-version response users excluding organizer as invitees,
      and users with ACCEPTED current-version responses as accepted.
      Returns no row if gathering does not exist.

  _responses (gathering: Gathering)
    : many (user: User, status: ResponseStatus)
    Returns responses to gathering's currentVersion in unspecified order;
      no rows if gathering does not exist.

  _forUser (user: User) : many (gathering: Gathering)
    Returns gatherings whose currentVersion has a response from user,
      ordered by the current version's start. Ties have unspecified order;
      no rows if absent.

  _commitments (user: User, from: DateTime, to: DateTime)
    : many (gathering: Gathering, start: DateTime, end: DateTime)
    Returns CONFIRMED gatherings whose attendees include user, whose
      current versions have not ended, and whose intervals intersect
      [from, to). Intervals are clipped to that range and the current time.
      Returns no rows for an empty or reversed range.
      Row order is unspecified.
```

**Notes.** In OpenTime, Context is bound to Grouping's Group. Reactions check membership before supplying invitees, and Gathering never reads another concept's state. Conflict checks and state changes occur atomically. Adding an invitee does not change existing acceptances. Accepting an already confirmed version immediately adds that person to its attendees. Editing creates a new version, preserves earlier versions and responses, resets invitees to PENDING, and returns the gathering to PROPOSED. Editing a confirmed gathering releases its previous commitments until the revised version is accepted and confirmed again. Requests include the version the user saw, preventing acceptance of unseen changes. 
When the last non-organizer attendee withdraws from a CONFIRMED gathering, it becomes CANCELLED only if no responses to its current version remain PENDING. Otherwise, it stays CONFIRMED so pending invitees can still accept and join. A proposal awaiting responses remains PROPOSED. Cancellation clears attendance and releases commitments without erasing responses or past versions. Cancelled gatherings cannot reopen. The organizer cancels rather than withdrawing.

## Notifying

```text
concept Notifying

purpose help recipients notice changes that may require their attention

principle a notice records a message and a destination for its recipient.
  It remains unread until that recipient marks it read. Repeating the
  same delivery does not create another notice.

types
  external User

state
  a set of Notices with
    a recipient User
    a sourceKey String
    a message String
    a destination String
    a createdAt DateTime
    an optional readAt DateTime
    unique recipient and sourceKey

actions
  notify (recipient: User, sourceKey: String, message: String,
    destination: String) : return (notice: Notice)
    where sourceKey, message, and destination are not blank
    then
      if a notice exists for recipient and sourceKey, return that notice
      otherwise create notice with the supplied values, createdAt set
        to the current time, and no readAt
      return notice

  markRead (user: User, notice: Notice) : return ()
    where notice exists with recipient user
    then
      if readAt is absent, set it to the current time
      return

queries
  _inbox (user: User) : many (notice: Notice, message: String,
    destination: String, createdAt: DateTime, readAt?: DateTime)
    Returns user's notices ordered newest first. Ties have unspecified
      order; no rows if absent.
```

**Notes.** Notifications are an in-app inbox in the MVP. Email, push delivery, and scheduled reminders are outside scope for now. A sourceKey identifies one triggering action occurrence and notice type, so a retried delivery reuses the key while a later action gets a new one. Destination is an application path identifying a group or gathering. Possessing that path does not grant access. Notices describe past changes, and the destination always shows the current authorized state. Reading a notice does not accept an invitation or change attendance.

## Essential Reactions

Requesting represents requests someone makes to the app, rather than another concept we need to design. For a request that requires signing in, the app first uses Authenticating to identify the user from their session. It then checks whether that user is allowed to perform the requested action. The authentication result must belong to the request being handled. Another user's successful authentication cannot authorize this request. If authentication or a permission check fails, the requested action does not happen.

Queries beginning with an underscore retrieve facts without changing state. They are internal to the application and are not unrestricted public endpoints. Each query result below belongs to the indicated request or triggering action. A missing required row prevents the reaction. Responses and notices go only to the specified requester or recipients.

### Invite someone to a group

```text
when
  Requesting.inviteMember(session, group, invitee)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Authenticating._exists(invitee) returns exists = true
then
  Grouping.invite(user, group, invitee)
```

**Notes.** Grouping's own preconditions require an active group and its owner. Creating, accepting, declining, leaving, removing, and closing use the same authentication pattern and their corresponding Grouping actions. A group-invitation view retrieves `_membership(user, group)` and `_getGroup(group)`; only a current member or pending invitee receives its details. `_groupsFor(user)` supplies the authenticated user's group list.

### Creating an opening

```text
when
  Requesting.createOpening(session, purpose, start, end)
  and Authenticating.authenticate(session) returns user
    within that request's flow
then
  AvailabilitySharing.create(user, purpose, start, end)
```

**Notes.** Users can only create openings for themselves. Openings cannot overlap with existing ones. Upon creation, openings are not shared with anyone.

### Publish an opening to selected groups

```text
when
  Requesting.publishOpening(session, opening, groups)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  for every group in groups, Grouping._getGroup(group) returns
    status = ACTIVE and members containing user
then
  AvailabilitySharing.publish(user, opening, groups)
```

**Notes.** Revision uses the same membership check for every group in the replacement audience set and invokes `AvailabilitySharing.revise`. Withdrawal requires authentication and invokes `withdraw`, whose owner check prevents changes to another person's opening. `_owned(user)` supplies the authenticated user's opening editor. Group membership is checked again whenever overlaps are requested, so leaving or closing a group stops its use of an opening immediately without modifying that opening.

### Discover a current group overlap

```text
when
  Requesting.findOverlap(session, group, purpose, from, to, duration)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Grouping._getGroup(group) returns status = ACTIVE and members
  user is in members, members contains at least two users,
    from is before to, and duration is positive
  AvailabilitySharing._sharedWith(group, purpose, from, to)
    returns shared intervals
  for each member, Gathering._commitments(member, from, to)
    returns that member's committed intervals
  each member's usable intervals are the union of their shared intervals
    minus the union of their committed intervals
  overlaps are the intersection of every member's usable intervals,
    restricted to continuous intervals at least duration long
then
  respond to that requester with overlaps ordered by start
```

**Notes.** The MVP finds overlaps for the group's complete current membership. A member without a matching shared opening contributes no usable time, producing no full-group overlap. The response contains common intervals, not individual openings, reasons for unavailability, audiences, or details of conflicting gatherings. A changed opening or membership is reflected on the next calculation. Confirmation masks conflicting time through `_commitments`, and withdrawal or cancellation releases it if the underlying opening still exists. Calculations use a consistent current snapshot. Aggregate results can still reveal limited information, especially in a two-person group.

### Propose a gathering

```text
when
  Requesting.proposeGathering(session, group, invitees,
    purpose, activity, place, start, end)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Grouping._getGroup(group) returns status = ACTIVE and members
  user and every invitee are in members
then
  Gathering.propose(user, group, invitees, purpose,
    activity, place, start, end)
```

**Notes.** Gathering validates its interval, required details, invitees, and the organizer's existing commitments. Selected overlap times are suggestions, not reservations. A proposal does not block anyone's openings. Invitations can be shared using the gathering's ordinary application URL. Opening it still requires authentication and participation in that gathering.

### Invite another person to a gathering

```text
when
  Requesting.inviteToGathering(session, gathering, version, invitee)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Gathering._get(gathering) returns context
  Grouping._getGroup(context) returns status = ACTIVE and members
  user and invitee are in members
then
  Gathering.invite(user, gathering, version, invitee)
```

**Notes.** Gathering checks that user is the organizer and version is current. Additional invitees must be current group members. Inviting someone before or after confirmation does not change existing acceptances or attendance.

### Edit a gathering

```text
when
  Requesting.editGathering(session, gathering, expectedVersion,
    purpose, activity, place, start, end)
  and Authenticating.authenticate(session) returns user
    within that request's flow
then
  Gathering.edit(user, gathering, expectedVersion,
    purpose, activity, place, start, end)
```

**Notes.** Only the organizer may edit the current version. Editing returns the gathering to PROPOSED and requires fresh acceptance and confirmation. The interface explains that editing a confirmed gathering releases its previous commitments. Adding an invitee alone uses invite instead.

### Accept and confirm the version shown

```text
when
  Requesting.acceptGathering(session, gathering, version)
  and Authenticating.authenticate(session) returns user
    within that request's flow
then
  Gathering.accept(user, gathering, version)
```

**Notes.** The request includes the version the user reviewed. Gathering rejects stale versions and conflicting commitments. Accepting a confirmed version immediately adds the user to its attendees, and accepting a proposal awaits confirmation. Existing invitees retain their response rights after leaving the originating group.

```text
when
  Requesting.confirmGathering(session, gathering, version, expectedAttendees)
  and Authenticating.authenticate(session) returns user
    within that request's flow
then
  Gathering.confirm(user, gathering, version, expectedAttendees)
```

**Notes.** The organizer's view obtains version and accepted through `Gathering._get`. The request submits both, using accepted as expectedAttendees. Gathering checks the current version, accepted roster, and attendees' commitments atomically. If anything changed, confirmation does not occur and the organizer refreshes before retrying. Requests to decline, withdraw, or cancel follow the same authentication pattern and include gathering and the version shown to the requester. They invoke `Gathering.decline(user, gathering, version)`, `Gathering.withdraw(user, gathering, version)`, or `Gathering.cancel(user, gathering, version)`. Each action enforces its own role and status requirements.

### View a gathering and flag changed willingness

```text
when
  Requesting.viewGathering(session, gathering)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Gathering._get(gathering) returns details, including version,
    organizer, invitees, accepted, purpose, start, end, status, and attendees
  user is organizer or is in invitees
  Gathering._responses(gathering) returns responses
  AvailabilitySharing._owned(user) returns own openings
  reviewNeeded is true exactly when gathering is CONFIRMED,
    has not started, user is in attendees, and the union of user's
    current openings matching purpose does not cover [start, end)
then
  respond to that requester with the gathering details, responses,
    and their own reviewNeeded flag
```

**Notes.** The flag is shown as "Outside your current openings" and does not change attendance. It can also appear when someone deliberately accepts an invitation outside their openings. A person may keep their commitment, update an opening, or explicitly withdraw. Other users' openings and review flags are not returned. `_forUser(user)` supplies the authenticated user's gathering list, including pending invitations. For a cancelled or expired proposal, the view explains that no further responses are accepted. The view returns the version used in subsequent response and confirmation requests.

### Notify a group invitee

```text
when
  Grouping.invite(user, group, invitee) completes
where
  Grouping._getGroup(group) returns name
then
  Notifying.notify(invitee,
    sourceKey = this invitation occurrence and GROUP_INVITATION,
    message = "You have been invited to " followed by name,
    destination = the application path for group)
```

**Notes.** Only the named invitee receives this notice. Re-inviting after a decline creates a new action occurrence and therefore a new notice. A removed invitation may leave an older notice, but following it does not restore access or membership.

### Notify gathering invitees

```text
when
  Gathering.propose(organizer, context, invitees, purpose,
    activity, place, start, end) returns gathering, version
then
  for each invitee, Notifying.notify(invitee,
    sourceKey = this proposal occurrence and GATHERING_INVITATION,
    message = "You have been invited to " followed by activity,
    destination = the application path for gathering)
```

**Notes.** Recipients and activity come from that particular proposal's inputs, and gathering comes from its output. The notice prompts a response without treating delivery or reading as acceptance.

### Notify an additional invitee

```text
when
  Gathering.invite(user, gathering, version, invitee) completes
then
  Notifying.notify(invitee,
    sourceKey = this invitation occurrence and GATHERING_INVITATION,
    message = "You have been invited to a gathering",
    destination = the application path for gathering)
```

**Notes.** This applies before or after confirmation. The invitee reviews the current version and decides whether to accept it. Reading the notice does not establish attendance.

### Notify invitees of an edit

```text
when
  Gathering.edit(user, gathering, expectedVersion,
    purpose, activity, place, start, end) returns version, affectedUsers
then
  for each recipient in affectedUsers, Notifying.notify(recipient,
    sourceKey = this edit occurrence and GATHERING_EDITED,
    message = "The gathering changed; review and respond to the new version",
    destination = the application path for gathering)
```

**Notes.** Recipients come from the edit's output. Previous acceptances do not apply to the new version. Any response must identify the version the recipient reviewed.

### Notify affected people of acceptance

```text
when
  Gathering.accept(user, gathering, version) returns joined, affectedUsers
where
  message is "A participant joined the confirmed gathering" if joined,
    otherwise "An invitee accepted your proposal"
then
  for each recipient in affectedUsers, Notifying.notify(recipient,
    sourceKey = this acceptance occurrence and GATHERING_ACCEPTED,
    message = message,
    destination = the application path for gathering)
```

**Notes.** Accepting a proposal notifies the organizer. Joining a confirmed gathering notifies its existing attendees. Recipients come from the action's output rather than a later roster query. The accepting user receives their result directly.

### Notify the organizer of a decline

```text
when
  Gathering.decline(user, gathering, version) completes
where
  Gathering._get(gathering) returns organizer
then
  Notifying.notify(organizer,
    sourceKey = this decline occurrence and GATHERING_DECLINED,
    message = "An invitee declined the gathering",
    destination = the application path for gathering)
```

**Notes.** Declining does not change existing attendance. The destination shows current responses rather than treating the notice as current state.

### Notify attendees of confirmation

```text
when
  Gathering.confirm(user, gathering, version, expectedAttendees)
    returns attendees
then
  for each recipient in attendees excluding user, Notifying.notify(recipient,
    sourceKey = this confirmation occurrence and GATHERING_CONFIRMED,
    message = "Your gathering has been confirmed",
    destination = the application path for gathering)
```

**Notes.** Only confirmed attendees receive this notice, using the returned roster. The organizer receives confirmation directly. Other invitees retain their invitations and may accept the current version before it starts, and they are not told that they committed.

### Notify affected people of withdrawal

```text
when
  Gathering.withdraw(user, gathering, version) returns affectedUsers, status
where
  status is PROPOSED or CONFIRMED
then
  for each recipient in affectedUsers, Notifying.notify(recipient,
    sourceKey = this withdrawal occurrence and GATHERING_WITHDRAWAL,
    message = "A participant has withdrawn from the gathering",
    destination = the application path for gathering)
```

**Notes.** Recipients are the organizer for a proposal or the remaining attendees for a confirmed gathering. This reaction applies when withdrawal leaves the gathering open. No explanation for withdrawal is collected or disclosed.

### Notify affected people of automatic closure

```text
when
  Gathering.withdraw(user, gathering, version) returns affectedUsers, status
where
  status is CANCELLED
then
  for each recipient in affectedUsers, Notifying.notify(recipient,
    sourceKey = this withdrawal occurrence and GATHERING_CANCELLED,
    message = "The gathering closed because only the organizer remained and no invitations were pending",
    destination = the application path for gathering)
```

**Notes.** Closure occurs within withdraw only when the organizer is the sole remaining attendee and no current-version responses are PENDING. The withdrawing user receives the result directly. The two withdrawal notification reactions are mutually exclusive.

### Notify invitees of organizer cancellation

```text
when
  Gathering.cancel(user, gathering, version) returns affectedUsers
then
  for each recipient in affectedUsers, Notifying.notify(recipient,
    sourceKey = this cancellation occurrence and GATHERING_CANCELLED,
    message = "The gathering has been cancelled",
    destination = the application path for gathering)
```

**Notes.** Recipients come from cancel's output, so clearing attendance does not lose the notification audience. Notification deliveries reuse their sourceKey when retried. A notification failure does not undo the gathering transition.

### View and acknowledge personal notices

```text
when
  Requesting.viewInbox(session)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Notifying._inbox(user) returns notices
then
  respond to that requester with notices
```

**Notes.** Marking a notice read follows the same authentication pattern and invokes `Notifying.markRead(user, notice)`. The concept's recipient check prevents acknowledging another person's notice. Following a destination uses the group or gathering access checks above rather than trusting the notification path.

## Roles of the Concepts

Authenticating identifies the account responsible for each request. Grouping establishes which people belong to a planning audience. AvailabilitySharing records when invitations would be welcome, while Gathering records responses and definite commitments. This separation lets a person change their openings without rewriting a confirmed plan. Notifying draws attention to invitations and changes without deciding what anyone has accepted.

All external User types are bound to Authenticating's User. AvailabilitySharing's Audience and Gathering's Context are bound to Grouping's Group. These are identities, not objects whose fields another concept may read. Reactions retrieve the necessary facts through each concept's queries and pass values through its actions. Group overlaps combine authorized openings with confirmed commitments while revealing only their common usable intervals. Confirmation, withdrawal, and cancellation change these calculated overlaps without deleting or copying opening records.

The MVP includes all five concepts, dated openings, versioned gathering proposals, and in-app notifications. Its central distinction is between belonging to a group, welcoming an invitation, accepting specific details, and having a confirmed plan. Each requires its own explicit evidence, and none is inferred from silence or an empty calendar.