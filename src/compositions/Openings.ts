import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { now, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { validateCalendarRequest, validateOpeningRequest, validateSelectedOverlapRequest } from "../openingValidation.ts";

const { Authenticating, Grouping, AvailabilitySharing } = concepts;
const options = { validators: { input: validateOpeningRequest } };

const Create = endpoint(
  "/openings/create",
  ({ session, start, end, user, opening }) => receive({ session, start, end })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(AvailabilitySharing.create({ owner: user, start, end }).responds({ opening }))
    .then(respond({ opening })),
  { ...options, input: { required: ["session", "start", "end"] } },
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
  ({ session, opening, start, end, audiences, user }) => receive({ session, opening, start, end, audiences })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(Grouping._canShareWith({ user, groups: audiences }).is({ allowed: true }))
        .then(AvailabilitySharing.revise({ user, opening, start, end, audiences }).responds({}))
        .then(respond({ revised: true })).named("allowed"),
      where(Grouping._canShareWith({ user, groups: audiences }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-member"),
    ),
  { ...options, input: { required: ["session", "opening", "start", "end", "audiences"] } },
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
  ({ session, group, from, to, duration, user, instant, overlaps, suggestions }) => receive({ session, group, from, to, duration })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(
        now(instant),
        AvailabilitySharing._overlapSnapshot({ user, group, from, to, duration, now: instant }).is({ allowed: true, overlaps, suggestions }),
      ).then(respond({ overlaps, suggestions })).named("member"),
      where(now(instant), AvailabilitySharing._overlapSnapshot({ user, group, from, to, duration, now: instant }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-member"),
    ),
  { ...options, input: { required: ["session", "group", "from", "to", "duration"] } },
);

const FindSelectedOverlap = endpoint(
  "/openings/selected-overlap",
  ({ session, group, invitees, from, to, duration, user, instant, overlaps }) => receive({ session, group, invitees, from, to, duration })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(now(instant), AvailabilitySharing._selectedOverlapSnapshot({ user, group, invitees, from, to, duration, now: instant })
        .is({ allowed: true, overlaps })).then(respond({ overlaps })).named("member"),
      where(now(instant), AvailabilitySharing._selectedOverlapSnapshot({ user, group, invitees, from, to, duration, now: instant })
        .is({ allowed: false })).then(respond({ error: "GROUP_FORBIDDEN" })).named("ineligible"),
    ),
  { validators: { input: validateSelectedOverlapRequest }, input: { required: ["session", "group", "invitees", "from", "to", "duration"] } },
);

const Calendar = endpoint(
  "/openings/calendar",
  ({ session, group, from, to, duration, user, instant, timeline, windows, total }) => receive({ session, group, from, to, duration })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(now(instant), AvailabilitySharing._calendarSnapshot({ user, group, from, to, duration, now: instant }).is({ allowed: true, timeline, windows, total }))
        .then(respond({ timeline, windows, total })).named("member"),
      where(now(instant), AvailabilitySharing._calendarSnapshot({ user, group, from, to, duration, now: instant }).is({ allowed: false }))
        .then(respond({ error: "GROUP_FORBIDDEN" })).named("not-member"),
    ),
  { validators: { input: validateCalendarRequest }, input: { required: ["session", "group", "from", "to", "duration"] } },
);

export const composition = { Create, Publish, Revise, Withdraw, Mine, FindOverlap, FindSelectedOverlap, Calendar };
