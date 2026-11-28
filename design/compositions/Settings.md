# Settings composition

Authenticated users manage only their own reminder and email settings. A reminder time applies to the confirmed gatherings they attend. An email address is used only after the user enters the code sent to it, and email reminders can be turned off or the address removed at any time. Responses never include verification codes.

A background worker (not an endpoint) reads confirmed gatherings starting soon through `Gathering._startingBetween`, each attendee's lead time through `Reminding._preferencesFor`, and sends one reminder per gathering version: `Notifying.notify` for the in-app notice and `Contacting.sendToUser` for email, then `Reminding.record`. A second worker delivers queued emails through the configured free provider.

The endpoints are [settings](reaction:OpenTime.Settings.Get), [save reminder time](reaction:OpenTime.Settings.SaveReminders), [request an email code](reaction:OpenTime.Settings.RequestEmailCode), [verify email](reaction:OpenTime.Settings.VerifyEmail), [remove email](reaction:OpenTime.Settings.RemoveEmail), and [email reminders on or off](reaction:OpenTime.Settings.SetEmailReminders).

```endpoints
OpenTime.Settings.Get at /settings/get
OpenTime.Settings.SaveReminders at /settings/reminders
OpenTime.Settings.RequestEmailCode at /settings/email/request
OpenTime.Settings.VerifyEmail at /settings/email/verify
OpenTime.Settings.RemoveEmail at /settings/email/remove
OpenTime.Settings.SetEmailReminders at /settings/email/reminders
```
