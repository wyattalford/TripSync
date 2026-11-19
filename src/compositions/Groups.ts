import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateAuthRequest } from "../requestValidation.ts";

const { Authenticating, Grouping } = concepts;
const options = { validators: { input: validateAuthRequest } };

const Create = endpoint(
  "/groups/create",
  ({ session, name, user, group }) => receive({ session, name })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Grouping.create({ owner: user, name }).responds({ group }))
    .then(respond({ group })),
  { ...options, input: { required: ["session", "name"] } },
);

const Invite = endpoint(
  "/groups/invite",
  ({ session, group, username, user, invitee }) => receive({ session, group, username })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(Authenticating._byUsername({ username }).is({ user: invitee }))
        .then(Grouping.invite({ user, group, invitee }).responds({}))
        .then(respond({ invited: true })).named("account-exists"),
      where(no(Authenticating._byUsername({ username })))
        .then(respond({ error: "GROUP_NOT_FOUND" })).named("account-missing"),
    ),
  { ...options, input: { required: ["session", "group", "username"] } },
);

const Accept = endpoint(
  "/groups/accept",
  ({ session, group, user }) => receive({ session, group })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Grouping.accept({ user, group }).responds({}))
    .then(respond({ accepted: true })),
  { ...options, input: { required: ["session", "group"] } },
);

const Decline = endpoint(
  "/groups/decline",
  ({ session, group, user }) => receive({ session, group })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Grouping.decline({ user, group }).responds({}))
    .then(respond({ declined: true })),
  { ...options, input: { required: ["session", "group"] } },
);

const Join = endpoint(
  "/groups/join",
  ({ session, url, user, group }) => receive({ session, url })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Grouping.join({ user, url }).responds({ group }))
    .then(respond({ group })),
  { ...options, input: { required: ["session", "url"] } },
);

const List = endpoint(
  "/groups/list",
  ({ session, user, groups }) => receive({ session })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(where(Grouping._visibleFor({ user }).is({ groups })).then(respond({ groups }))),
  { ...options, input: { required: ["session"] } },
);

const Link = endpoint(
  "/groups/link",
  ({ session, group, user, url }) => receive({ session, group })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(
        Grouping._getGroup({ group }).is({ owner: user, status: "ACTIVE" }),
        Grouping._joinUrl({ group }).is({ url }),
      ).then(respond({ url })).named("owner"),
      where(Grouping._getGroup({ group }), no(Grouping._getGroup({ group }).is({ owner: user, status: "ACTIVE" })))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-owner"),
      where(no(Grouping._getGroup({ group })))
        .then(respond({ error: "GROUP_NOT_FOUND" })).named("group-missing"),
    ),
  { ...options, input: { required: ["session", "group"] } },
);

const Leave = endpoint(
  "/groups/leave",
  ({ session, group, user }) => receive({ session, group })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Grouping.leave({ user, group }).responds({}))
    .then(respond({ left: true })),
  { ...options, input: { required: ["session", "group"] } },
);

const Remove = endpoint(
  "/groups/remove",
  ({ session, group, username, user, member }) => receive({ session, group, username })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(Authenticating._byUsername({ username }).is({ user: member }))
        .then(Grouping.remove({ user, group, member }).responds({}))
        .then(respond({ removed: true })).named("account-exists"),
      where(no(Authenticating._byUsername({ username })))
        .then(respond({ error: "GROUP_NOT_FOUND" })).named("account-missing"),
    ),
  { ...options, input: { required: ["session", "group", "username"] } },
);

const Close = endpoint(
  "/groups/close",
  ({ session, group, user }) => receive({ session, group })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Grouping.close({ user, group }).responds({}))
    .then(respond({ closed: true })),
  { ...options, input: { required: ["session", "group"] } },
);

export const composition = { Create, Invite, Accept, Decline, Join, List, Link, Leave, Remove, Close };
