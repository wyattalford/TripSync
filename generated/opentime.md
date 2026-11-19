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

#### Instances

- `Authenticating` — instance of `Authenticating` — [Application types](../design/types.md), line 9.

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

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/auth/current` — requires `session`
- `/auth/register` — requires `username`, `password`
- `/auth/sign-in` — requires `username`, `password`
- `/auth/sign-out` — requires `session`
