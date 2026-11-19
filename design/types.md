# Application types

OpenTime identifies people through Authenticating. Grouping binds its external User type to Authenticating.User.
AvailabilitySharing binds User to Authenticating.User and Audience to Grouping.Group.
Gathering binds User to Authenticating.User and Context to Grouping.Group.
Notifying binds User to Authenticating.User.

```types
```

```instances
instantiate Authenticating
instantiate Grouping with
  User is Authenticating.User

instantiate AvailabilitySharing with
  User is Authenticating.User
  Audience is Grouping.Group

instantiate Gathering with
  User is Authenticating.User
  Context is Grouping.Group

instantiate Notifying with
  User is Authenticating.User
```
