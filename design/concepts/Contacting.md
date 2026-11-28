# Contacting

## Purpose

Reach a person outside the app at an address they have proven they control.

## Principle

A user enters an email address and receives a short code there. Entering that code proves the address belongs to them, and only then can messages be emailed to them. They can turn email reminders off or remove the address at any time. Repeating a message with the same source key queues it only once.

## Types

```types
external User
opaque ContactDetails
  The user's verified address, pending address, and email preference.
opaque PendingEmails
  Queued emails awaiting delivery; internal to the delivery worker.
```

## State

```state
a set of Contacts with
  a user User
  an optional email String
  an optional pendingEmail String
  an optional codeVerifier String
  an optional codeExpiresAt DateTime
  a codeAttempts Number
  an optional codeSentAt DateTime
  an emailReminders Flag

a set of Emails with
  a user User
  a sourceKey String
  a to String
  a subject String
  a text String
  a html String
  a createdAt DateTime
  an optional sentAt DateTime
  an attempts Number
  a nextAttemptAt DateTime
  unique user and sourceKey

Rule: An email is queued only to a verified address.
Rule: Verification codes are six digits, stored only as a derived verifier, expire after 15 minutes, and allow five attempts.
Rule: A new code can be requested at most once per minute.
```

## Actions

```actions
requestVerification(user: User, email: String) : returns ()
  where email is not a valid address
  then
    refuses INVALID_EMAIL "Enter a valid email address."
  where a code was sent to user less than a minute ago
  then
    refuses CODE_COOLDOWN "Wait a minute before requesting another code."
  where the address is valid and no code was sent in the last minute
  then
    set pendingEmail, a new code verifier, its expiry, and zero attempts
    queue an email containing the code to that address
    returns

verify(user: User, code: String) : returns (email: String)
  where user has no pending address, the code expired, or five attempts were used
  then
    refuses CODE_EXPIRED "That code has expired. Request a new one."
  where the code does not match
  then
    refuses INVALID_CODE "That code is incorrect."
  where the code matches
  then
    make pendingEmail the verified email and clear the code
    returns email

removeEmail(user: User) : returns ()
  where always
  then
    clear the user's email, pending address, and code
    returns

setEmailReminders(user: User, enabled: Flag) : returns ()
  where always
  then
    set emailReminders to enabled
    returns

sendToUser(user: User, sourceKey: String, subject: String, text: String, html: String) : returns (queued: Flag)
  where user has no verified email or has turned email reminders off
  then
    set queued to false without queuing anything
    returns queued
  where user has a verified email with reminders on
  then
    queue the email to that address unless one with sourceKey was already queued for user, and set queued to true
    returns queued

markSent(email: Email) : returns ()
  where always
  then
    set sentAt to now
    returns

markFailed(email: Email) : returns ()
  where always
  then
    add an attempt and delay the next attempt
    returns
```

## Queries

```queries
_contact(user: User) : one (contact: ContactDetails)
  Returns the verified address, pending address, and email preference, without codes.

_pendingEmails(now: DateTime) : one (emails: PendingEmails)
  Returns unsent emails whose next attempt is due and that have fewer than five attempts. Internal to delivery; never a public endpoint.
```
