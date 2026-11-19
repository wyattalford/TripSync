import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateAuthRequest } from "../requestValidation.ts";

const { Authenticating, Notifying } = concepts;
const options = { validators: { input: validateAuthRequest } };

const List = endpoint(
  "/notices/list",
  ({ session, user, notices }) => receive({ session })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(where(Notifying._inbox({ user }).is({ notices })).then(respond({ notices }))),
  { ...options, input: { required: ["session"] } },
);

const MarkRead = endpoint(
  "/notices/mark-read",
  ({ session, notice, user }) => receive({ session, notice })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Notifying.markRead({ user, notice }).responds({}))
    .then(respond({ markedRead: true })),
  { ...options, input: { required: ["session", "notice"] } },
);

export const composition = { List, MarkRead };
