# Grouping

## Purpose

Maintain a shared, consensual record of who belongs to a group.

## Principle

A user creates a group and becomes its owner and first member. The owner invites others individually or shares the group's join URL. Others become members only by accepting an invitation or choosing to join through that URL. Invitations alone do not establish membership.

## Types

```types
external User
GroupStatus is ACTIVE or CLOSED
MembershipStatus is PENDING or MEMBER or DECLINED or LEFT or REMOVED
opaque Members
  A set of User identities with MEMBER status.
opaque GroupSummaries
  A set of active group summaries visible to one user.
```

## State

```state
a set of Groups with
  an owner User
  a name String
  a status GroupStatus
  a unique url String

a set of Memberships with
  a group Group
  a user User
  a status MembershipStatus
  unique group and user

Rule: Each group's owner is a MEMBER. Ownership is fixed.
```

## Actions

```actions
create(owner: User, name: String) : returns (group: Group)
  where name is blank
  then
    refuses INVALID_GROUP "Enter a group name."
  where name is not blank
  then
    create an ACTIVE group with a fresh unguessable join URL
    add owner as MEMBER
    returns group

invite(user: User, group: Group, invitee: User) : returns ()
  where group is not ACTIVE or user is not its owner or invitee is user
  then
    refuses GROUP_FORBIDDEN "Only the owner can invite another account."
  where invitee is already PENDING or MEMBER
  then
    refuses MEMBERSHIP_CONFLICT "This account is already invited or a member."
  where group is ACTIVE, user is owner, and invitee is eligible
  then
    set invitee's membership to PENDING
    returns

accept(user: User, group: Group) : returns ()
  where group is ACTIVE and user is PENDING
  then
    set user to MEMBER
    returns
  where there is no active invitation
  then
    refuses MEMBERSHIP_CONFLICT "There is no active invitation to accept."

decline(user: User, group: Group) : returns ()
  where group is ACTIVE and user is PENDING
  then
    set user to DECLINED
    returns
  where there is no active invitation
  then
    refuses MEMBERSHIP_CONFLICT "There is no active invitation to decline."

join(user: User, url: String) : returns (group: Group)
  where url identifies an ACTIVE group and user is absent, PENDING, DECLINED, or LEFT
  then
    set user to MEMBER
    returns group
  where user is REMOVED
  then
    refuses GROUP_FORBIDDEN "Ask the owner for a new invitation."
  where the link is unavailable or user already belongs
  then
    refuses MEMBERSHIP_CONFLICT "This link is unavailable or you already belong."

leave(user: User, group: Group) : returns ()
  where group is ACTIVE, user is MEMBER, and user is not owner
  then
    set user to LEFT
    returns
  where user cannot leave
  then
    refuses GROUP_FORBIDDEN "You cannot leave this group."

remove(user: User, group: Group, member: User) : returns ()
  where group is ACTIVE, user is owner, member differs from user, and member is PENDING or MEMBER
  then
    set member to REMOVED
    returns
  where member cannot be removed by user
  then
    refuses GROUP_FORBIDDEN "You cannot remove this person."

close(user: User, group: Group) : returns ()
  where group is ACTIVE and user is owner
  then
    set group to CLOSED
    returns
  where user is not owner of an active group
  then
    refuses GROUP_FORBIDDEN "Only the owner can close an active group."
```

## Queries

```queries
_getGroup(group: Group) : optional (owner: User, name: String, status: GroupStatus, members: Members)
  Returns the owner, name, status, and current members.

_membership(user: User, group: Group) : optional (status: MembershipStatus)
  Returns the user's membership status.

_groupsFor(user: User) : many (group: Group)
  Returns active groups in which the user is a member.

_joinUrl(group: Group) : optional (url: String)
  Returns the group's join URL.

_visibleFor(user: User) : one (groups: GroupSummaries)
  Returns active groups where the user is a member or pending invitee, with group, name, owner, membership, and memberCount for each.
```
