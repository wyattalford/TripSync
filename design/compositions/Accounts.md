# Accounts composition

Browser requests use an HttpOnly session cookie. Registration creates an account; signing in issues a session cookie. Every protected request authenticates the cookie within its own flow. Sign-out revokes the session and clears the cookie. The current-account view returns only the requesting account's identifier and username.

The account endpoints are [registration](reaction:OpenTime.Accounts.Register), [sign-in](reaction:OpenTime.Accounts.SignIn), [current-account lookup](reaction:OpenTime.Accounts.CurrentUser), and [sign-out](reaction:OpenTime.Accounts.SignOut).

```endpoints
OpenTime.Accounts.Register at /auth/register
OpenTime.Accounts.SignIn at /auth/sign-in
OpenTime.Accounts.CurrentUser at /auth/current
OpenTime.Accounts.SignOut at /auth/sign-out
```
