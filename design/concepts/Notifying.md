# Notifying

## Purpose

Help recipients notice changes that may require their attention.

## Principle

A notice records a message and destination for one recipient. It remains unread until that recipient marks it read. Repeating delivery with the same source key returns the existing notice.

## Types

```types
external User
opaque NoticeSummaries
  The authenticated user's inbox summaries.
```

## State

```state
a set of Notices with
  a recipient User
  a sourceKey String
  a message String
  a destination String
  a createdAt DateTime
  an optional readAt DateTime
  unique recipient and sourceKey
```

## Actions

```actions
notify(recipient: User, sourceKey: String, message: String, destination: String) : returns (notice: Notice)
  where sourceKey, message, or destination is invalid
  then
    refuses INVALID_NOTICE "A notice needs a source, message, and application destination."
  where a notice already exists for recipient and sourceKey
  then
    returns notice
  where the notice is new
  then
    create it with createdAt now and no readAt
    returns notice

markRead(user: User, notice: Notice) : returns ()
  where notice does not belong to user
  then
    refuses NOTICE_FORBIDDEN "This notice is not yours."
  where notice belongs to user
  then
    set readAt if absent
    returns
```

## Queries

```queries
_inbox(user: User) : one (notices: NoticeSummaries)
  Returns the user's notices newest first, including read timestamps when present.
```
