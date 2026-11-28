import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateSettingsRequest } from "../settingsValidation.ts";

const { Authenticating, Contacting, Reminding } = concepts;
const options = { validators: { input: validateSettingsRequest } };

const Get = endpoint(
  "/settings/get",
  ({ session, user, leadMinutes, timeZone, contact }) => receive({ session })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(where(Reminding._preferences({ user }).is({ leadMinutes, timeZone }), Contacting._contact({ user }).is({ contact }))
      .then(respond({ leadMinutes, timeZone, contact }))),
  { ...options, input: { required: ["session"] } },
);

const SaveReminders = endpoint(
  "/settings/reminders",
  ({ session, user, leadMinutes, timeZone }) => receive({ session, leadMinutes, timeZone })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Reminding.setPreferences({ user, leadMinutes, timeZone }).responds({}))
    .then(respond({ saved: true })),
  { ...options, input: { required: ["session", "leadMinutes", "timeZone"] } },
);

const RequestEmailCode = endpoint(
  "/settings/email/request",
  ({ session, user, email }) => receive({ session, email })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Contacting.requestVerification({ user, email }).responds({}))
    .then(respond({ sent: true })),
  { ...options, input: { required: ["session", "email"] } },
);

const VerifyEmail = endpoint(
  "/settings/email/verify",
  ({ session, user, code, email }) => receive({ session, code })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Contacting.verify({ user, code }).responds({ email }))
    .then(respond({ email })),
  { ...options, input: { required: ["session", "code"] } },
);

const RemoveEmail = endpoint(
  "/settings/email/remove",
  ({ session, user }) => receive({ session })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Contacting.removeEmail({ user }).responds({}))
    .then(respond({ removed: true })),
  { ...options, input: { required: ["session"] } },
);

const SetEmailReminders = endpoint(
  "/settings/email/reminders",
  ({ session, user, enabled }) => receive({ session, enabled })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Contacting.setEmailReminders({ user, enabled }).responds({}))
    .then(respond({ saved: true })),
  { ...options, input: { required: ["session", "enabled"] } },
);

export const composition = { Get, SaveReminders, RequestEmailCode, VerifyEmail, RemoveEmail, SetEmailReminders };
