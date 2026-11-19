# Authenticating

## Purpose

Establish the account responsible for each request.

## Principle

A person registers a unique username and password, then signs in to receive a session. That session identifies the person until sign-out or expiry. Signing out revokes the session.

## Types

```types
opaque UserSet
  A set of registered User identifiers supplied by an authorized reaction.
opaque AccountLabels
  Identifiers and public usernames for those users.
```

## State

```state
a set of Users with
  a unique username String
  a passwordVerifier String

a set of Sessions with
  a user User
  an expiresAt DateTime

Rule: Password verifiers are securely derived from passwords and do not contain plaintext passwords.
Rule: Session identifiers are virtually unguessable and expire after 30 minutes.
```

## Actions

```actions
register(username: String, password: String) : returns (user: User)
  where username or password is blank
  then
    refuses INVALID_CREDENTIALS "A username and password are required."
  where username already belongs to a user
  then
    refuses USERNAME_TAKEN "That username is already registered."
  where the inputs are valid and the username is unused
  then
    add a user with username and a securely derived passwordVerifier
    returns user

signIn(username: String, password: String) : returns (session: Session, expiresAt: DateTime)
  where no user has the username or the password does not match
  then
    refuses INVALID_CREDENTIALS "The username or password is incorrect."
  where a user has the username and the password matches
  then
    add a session for that user with expiresAt 30 minutes from now
    returns session, expiresAt

authenticate(session: Session) : returns (user: User)
  where session is unknown or expired
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists and has not expired
  then
    bind user to the session's user
    returns user

signOut(session: Session) : returns ()
  where session is unknown or expired
  then
    refuses UNKNOWN_SESSION "This session is not active."
  where session exists and has not expired
  then
    remove the session
    returns
```

## Queries

```queries
_exists(user: User) : one (exists: Flag)
  Answers whether user exists.

_byUsername(username: String) : optional (user: User)
  Answers the registered user with this username, or no row.

_username(user: User) : optional (username: String)
  Answers this user's username, or no row.

_usernames(users: UserSet) : one (accounts: AccountLabels)
  Answers the identifiers and usernames of the supplied registered users.
```
