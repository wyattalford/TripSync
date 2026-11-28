# Reminding

## Purpose

Help attendees remember confirmed plans shortly before they start.

## Principle

Each user chooses how long before a gathering they want to be reminded, from one minute to 24 hours (one hour unless they change it). Each confirmed version of a gathering they attend produces one reminder at that time. Editing a gathering creates a new version, so its new time gets its own reminder. Changing the lead time applies to reminders not yet sent.

## Types

```types
external User
external Gathering
external Version
opaque UserSet
  A set of User identities supplied by the reminder worker.
opaque ReminderPreferences
  Lead times and time zones for the supplied users.
```

## State

```state
a set of Preferences with
  a user User
  a leadMinutes Number
  a timeZone String

a set of Reminders with
  a user User
  a gathering Gathering
  a version Version
  a sentAt DateTime
  unique user and version

Rule: A lead time is a whole number of minutes from 1 to 1440. Without a saved preference, it is 60 minutes in America/New_York.
```

## Actions

```actions
setPreferences(user: User, leadMinutes: Number, timeZone: String) : returns ()
  where leadMinutes is not a whole number from 1 to 1440, or timeZone is not a known time zone
  then
    refuses INVALID_REMINDER "Choose a reminder time between 1 minute and 24 hours."
  where the preferences are valid
  then
    save leadMinutes and timeZone for user
    returns

record(user: User, gathering: Gathering, version: Version) : returns (first: Flag)
  where a reminder for user and version was already recorded
  then
    set first to false without changing state
    returns first
  where no reminder for user and version exists
  then
    add a reminder with sentAt now and set first to true
    returns first
```

## Queries

```queries
_preferences(user: User) : one (leadMinutes: Number, timeZone: String)
  Returns the user's lead time and time zone, or the defaults.

_preferencesFor(users: UserSet) : one (preferences: ReminderPreferences)
  Returns lead times and time zones for each supplied user, using defaults when unset.

_recorded(user: User, version: Version) : one (recorded: Flag)
  Answers whether this reminder was already sent.
```
