import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateAuthRequest } from "../requestValidation.ts";

const { Authenticating } = concepts;

const Register = endpoint(
  "/auth/register",
  ({ username, password, user }) =>
    receive({ username, password })
      .then(Authenticating.register({ username, password }).responds({ user }))
      .then(respond({ user })),
  { validators: { input: validateAuthRequest }, input: { required: ["username", "password"] } },
);

const SignIn = endpoint(
  "/auth/sign-in",
  ({ username, password, session, expiresAt }) =>
    receive({ username, password })
      .then(Authenticating.signIn({ username, password }).responds({ session, expiresAt }))
      .then(respond({ session, expiresAt })),
  { validators: { input: validateAuthRequest }, input: { required: ["username", "password"] } },
);

const CurrentUser = endpoint(
  "/auth/current",
  ({ session, user, username }) =>
    receive({ session })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(where(Authenticating._username({ user }).is({ username })).then(respond({ user, username }))),
  { validators: { input: validateAuthRequest }, input: { required: ["session"] } },
);

const SignOut = endpoint(
  "/auth/sign-out",
  ({ session }) =>
    receive({ session })
      .then(Authenticating.signOut({ session }).responds({}))
      .then(respond({ signedOut: true })),
  { validators: { input: validateAuthRequest }, input: { required: ["session"] } },
);

export const composition = { Register, SignIn, CurrentUser, SignOut };
