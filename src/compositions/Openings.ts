import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { now, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateOpeningRequest } from "../openingValidation.ts";

const { Authenticating, Grouping, AvailabilitySharing } = concepts;
const options = { validators: { input: validateOpeningRequest } };

const Create = endpoint(
  "/openings/create",
  ({ session, purpose, start, end, user, opening }) => receive({ session, purpose, start, end })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(AvailabilitySharing.create({ owner: user, purpose, start, end }).responds({ opening }))
    .then(respond({ opening })),
  { ...options, input: { required: ["session", "purpose", "start", "end"] } },
);

const Publish = endpoint(
  "/openings/publish",
  ({ session, opening, audiences, user }) => receive({ session, opening, audiences })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(Grouping._canShareWith({ user, groups: audiences }).is({ allowed: true }))
        .then(AvailabilitySharing.publish({ user, opening, audiences }).responds({}))
        .then(respond({ published: true })).named("allowed"),
      where(Grouping._canShareWith({ user, groups: audiences }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-member"),
    ),
  { ...options, input: { required: ["session", "opening", "audiences"] } },
);

const Revise = endpoint(
  "/openings/revise",
  ({ session, opening, purpose, start, end, audiences, user }) => receive({ session, opening, purpose, start, end, audiences })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(Grouping._canShareWith({ user, groups: audiences }).is({ allowed: true }))
        .then(AvailabilitySharing.revise({ user, opening, purpose, start, end, audiences }).responds({}))
        .then(respond({ revised: true })).named("allowed"),
      where(Grouping._canShareWith({ user, groups: audiences }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-member"),
    ),
  { ...options, input: { required: ["session", "opening", "purpose", "start", "end", "audiences"] } },
);

const Withdraw = endpoint(
  "/openings/withdraw",
  ({ session, opening, user }) => receive({ session, opening })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(AvailabilitySharing.withdraw({ user, opening }).responds({}))
    .then(respond({ withdrawn: true })),
  { ...options, input: { required: ["session", "opening"] } },
);

const Mine = endpoint(
  "/openings/mine",
  ({ session, user, openings }) => receive({ session })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(where(AvailabilitySharing._ownedSnapshot({ user }).is({ openings })).then(respond({ openings }))),
  { ...options, input: { required: ["session"] } },
);

const FindOverlap = endpoint(
  "/openings/overlap",
  ({ session, group, purpose, from, to, duration, user, instant, overlaps, suggestions }) => receive({ session, group, purpose, from, to, duration })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(
        now(instant),
        AvailabilitySharing._overlapSnapshot({ user, group, purpose, from, to, duration, now: instant }).is({ allowed: true, overlaps, suggestions }),
      ).then(respond({ overlaps, suggestions })).named("member"),
      where(now(instant), AvailabilitySharing._overlapSnapshot({ user, group, purpose, from, to, duration, now: instant }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-member"),
    ),
  { ...options, input: { required: ["session", "group", "purpose", "from", "to", "duration"] } },
);

export const composition = { Create, Publish, Revise, Withdraw, Mine, FindOverlap };
