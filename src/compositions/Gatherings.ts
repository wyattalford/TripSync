import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateGatheringRequest } from "../gatheringValidation.ts";

const { Authenticating, Grouping, Gathering } = concepts;
const options = { validators: { input: validateGatheringRequest } };

const Propose = endpoint(
  "/gatherings/propose",
  ({ session, group, invitees, purpose, activity, place, start, end, user, gathering, version }) =>
    receive({ session, group, invitees, purpose, activity, place, start, end })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(Grouping._canPlanWith({ user, group, invitees }).is({ allowed: true }))
          .then(Gathering.propose({ organizer: user, context: group, invitees, purpose, activity, place, start, end }).responds({ gathering, version }))
          .then(respond({ gathering, version })).named("eligible"),
        where(Grouping._canPlanWith({ user, group, invitees }).is({ allowed: false }))
          .then(respond({ error: "GROUP_FORBIDDEN" })).named("ineligible"),
      ),
  { ...options, input: { required: ["session", "group", "invitees", "purpose", "activity", "place", "start", "end"] } },
);

const Edit = endpoint(
  "/gatherings/edit",
  ({ session, gathering, expectedVersion, purpose, activity, place, start, end, user, version, affectedUsers }) =>
    receive({ session, gathering, expectedVersion, purpose, activity, place, start, end })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Gathering.edit({ user, gathering, expectedVersion, purpose, activity, place, start, end }).responds({ version, affectedUsers }))
      .then(respond({ version })),
  { ...options, input: { required: ["session", "gathering", "expectedVersion", "purpose", "activity", "place", "start", "end"] } },
);

const Invite = endpoint(
  "/gatherings/invite",
  ({ session, gathering, version, invitee, user, context }) => receive({ session, gathering, version, invitee })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(Gathering._contextFor({ gathering }).is({ context }), Grouping._canInviteToGathering({ user, group: context, invitee }).is({ allowed: true }))
        .then(Gathering.invite({ user, gathering, version, invitee }).responds({}))
        .then(respond({ invited: true })).named("eligible"),
      where(Gathering._contextFor({ gathering }).is({ context }), Grouping._canInviteToGathering({ user, group: context, invitee }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("ineligible"),
    ),
  { ...options, input: { required: ["session", "gathering", "version", "invitee"] } },
);

const Accept = endpoint(
  "/gatherings/accept",
  ({ session, gathering, version, user, joined, affectedUsers }) => receive({ session, gathering, version })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Gathering.accept({ user, gathering, version }).responds({ joined, affectedUsers }))
    .then(respond({ joined })),
  { ...options, input: { required: ["session", "gathering", "version"] } },
);

const Decline = endpoint(
  "/gatherings/decline",
  ({ session, gathering, version, user }) => receive({ session, gathering, version })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Gathering.decline({ user, gathering, version }).responds({}))
    .then(respond({ declined: true })),
  { ...options, input: { required: ["session", "gathering", "version"] } },
);

const Withdraw = endpoint(
  "/gatherings/withdraw",
  ({ session, gathering, version, user, affectedUsers, status }) => receive({ session, gathering, version })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Gathering.withdraw({ user, gathering, version }).responds({ affectedUsers, status }))
    .then(respond({ status })),
  { ...options, input: { required: ["session", "gathering", "version"] } },
);

const Cancel = endpoint(
  "/gatherings/cancel",
  ({ session, gathering, version, user, affectedUsers }) => receive({ session, gathering, version })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Gathering.cancel({ user, gathering, version }).responds({ affectedUsers }))
    .then(respond({ cancelled: true })),
  { ...options, input: { required: ["session", "gathering", "version"] } },
);

const Confirm = endpoint(
  "/gatherings/confirm",
  ({ session, gathering, version, expectedAttendees, user, attendees }) => receive({ session, gathering, version, expectedAttendees })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(Gathering.confirm({ user, gathering, version, expectedAttendees }).responds({ attendees }))
    .then(respond({ attendees })),
  { ...options, input: { required: ["session", "gathering", "version", "expectedAttendees"] } },
);

const List = endpoint(
  "/gatherings/list",
  ({ session, user, gatherings }) => receive({ session })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(where(Gathering._listFor({ user }).is({ gatherings })).then(respond({ gatherings }))),
  { ...options, input: { required: ["session"] } },
);

const Get = endpoint(
  "/gatherings/get",
  ({ session, gathering, user, organizer, context, version, purpose, activity, place, start, end, status, invitees, accepted, attendees }) =>
    receive({ session, gathering })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Gathering._visibleTo({ user, gathering }).is({ allowed: true }),
          Gathering._get({ gathering }).is({ organizer, context, version, purpose, activity, place, start, end, status, invitees, accepted, attendees }),
        ).then(respond({ gathering, organizer, context, version, purpose, activity, place, start, end, status, invitees, accepted, attendees })).named("participant"),
        where(Gathering._visibleTo({ user, gathering }).is({ allowed: false }))
          .then(respond({ error: "GATHERING_FORBIDDEN" })).named("outsider"),
      ),
  { ...options, input: { required: ["session", "gathering"] } },
);

export const composition = { Propose, Invite, Edit, Accept, Decline, Confirm, Withdraw, Cancel, List, Get };
