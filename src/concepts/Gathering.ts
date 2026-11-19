import type { Collection, Db, ClientSession } from "mongodb";
import { queueNotices } from "../noticeOutbox.ts";

export class InvalidGathering extends Error {}
export class GatheringConflict extends Error {}
export class StaleGathering extends Error {}
export class GatheringForbidden extends Error {}

type ResponseStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
type GatheringStatus = "PROPOSED" | "CONFIRMED" | "CANCELLED";
type Version = {
  version: string;
  number: number;
  purpose: string;
  activity: string;
  place: string;
  start: Date;
  end: Date;
  responses: Record<string, ResponseStatus>;
};
type GatheringDocument = {
  _id: string;
  organizer: string;
  context: string;
  status: GatheringStatus;
  currentVersion: string;
  currentStart: Date;
  currentEnd: Date;
  versions: Version[];
  attendees: string[];
};
type ControlDocument = { _id: string; revision: number };

const ABSOLUTE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
function instant(value: string): Date | null {
  if (!ABSOLUTE_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function current(document: GatheringDocument): Version {
  const found = document.versions.find((item) => item.version === document.currentVersion);
  if (!found) throw new Error("Gathering current version is missing.");
  return found;
}
function sameUsers(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length
    && left.every((user) => right.includes(user));
}

async function conflicting(gatherings: Collection<GatheringDocument>, users: string[], start: Date, end: Date, except?: string, session?: ClientSession) {
  return gatherings.findOne({
    ...(except ? { _id: { $ne: except } } : {}), status: "CONFIRMED", attendees: { $in: users },
    currentStart: { $lt: end }, currentEnd: { $gt: start },
  }, { session });
}

async function serializedCommitmentChange<T>(db: Db, control: Collection<ControlDocument>, change: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      await control.updateOne({ _id: "commitments" }, { $inc: { revision: 1 } }, { session });
      return change(session);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
}

export class GatheringConcept {
  private readonly gatherings: Collection<GatheringDocument>;
  private readonly control: Collection<ControlDocument>;
  constructor(private readonly db: Db, private readonly clock: () => Date = () => new Date()) {
    this.gatherings = db.collection<GatheringDocument>("gathering.gatherings");
    this.control = db.collection<ControlDocument>("gathering.control");
  }

  async propose({ organizer, context, invitees, purpose, activity, place, start, end }: {
    organizer: string; context: string; invitees: string[]; purpose: string; activity: string; place: string; start: string; end: string;
  }) {
    const parsedStart = instant(start), parsedEnd = instant(end);
    const selected = [...new Set(invitees)];
    if (!parsedStart || !parsedEnd || parsedStart <= this.clock() || parsedStart >= parsedEnd || selected.length === 0
      || selected.includes(organizer) || !purpose.trim() || !activity.trim() || !place.trim()) {
      throw new InvalidGathering("Choose invitees and valid future gathering details.");
    }
    const gathering = crypto.randomUUID(), version = crypto.randomUUID();
    await this.control.updateOne({ _id: "commitments" }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    return serializedCommitmentChange(this.db, this.control, async (session) => {
      if (await conflicting(this.gatherings, [organizer], parsedStart, parsedEnd, undefined, session)) {
        throw new GatheringConflict("A participant has a conflicting confirmed gathering.");
      }
      await this.gatherings.insertOne({
        _id: gathering, organizer, context, status: "PROPOSED", currentVersion: version,
        currentStart: parsedStart, currentEnd: parsedEnd, attendees: [],
        versions: [{ version, number: 1, purpose: purpose.trim(), activity: activity.trim(), place: place.trim(),
          start: parsedStart, end: parsedEnd,
          responses: Object.fromEntries([[organizer, "ACCEPTED"], ...selected.map((user) => [user, "PENDING"])]) as Record<string, ResponseStatus> }],
      }, { session });
      await queueNotices(this.db, session, { recipients: selected, message: `You have been invited to ${activity.trim()}`, destination: `/gatherings/${gathering}` });
      return { gathering, version };
    });
  }

  async invite({ user, gathering, version, invitee }: { user: string; gathering: string; version: string; invitee: string }) {
    return serializedCommitmentChange(this.db, this.control, async (session) => {
    const document = await this.gatherings.findOne({ _id: gathering }, { session });
    if (!document || document.organizer !== user || user === invitee || document.status === "CANCELLED"
      || document.currentVersion !== version || current(document).start <= this.clock()) {
      throw new GatheringForbidden("Only the organizer can invite another person to the current gathering.");
    }
    const response = current(document).responses[invitee];
    if (response && response !== "DECLINED" && response !== "WITHDRAWN") throw new GatheringForbidden("This person already has a current invitation.");
    const path = `versions.$[version].responses.${invitee}`;
    const result = await this.gatherings.updateOne(
      { _id: gathering, currentVersion: version, status: { $in: ["PROPOSED", "CONFIRMED"] },
        versions: { $elemMatch: { version, [`responses.${invitee}`]: response ?? { $exists: false } } } },
      { $set: { [path]: "PENDING" } }, { arrayFilters: [{ "version.version": version }], session },
    );
    if (!result.modifiedCount) throw new StaleGathering("Refresh to review the current gathering.");
    await queueNotices(this.db, session, { recipients: [invitee], message: "You have been invited to a gathering", destination: `/gatherings/${gathering}` });
    return {};
    });
  }

  async edit({ user, gathering, expectedVersion, purpose, activity, place, start, end }: {
    user: string; gathering: string; expectedVersion: string; purpose: string; activity: string; place: string; start: string; end: string;
  }) {
    const parsedStart = instant(start), parsedEnd = instant(end);
    return serializedCommitmentChange(this.db, this.control, async (session) => {
      const document = await this.gatherings.findOne({ _id: gathering }, { session });
      if (!document || document.organizer !== user || document.status === "CANCELLED" || document.currentVersion !== expectedVersion || current(document).start <= this.clock()) {
        throw new StaleGathering("Refresh to review the current gathering.");
      }
      const previous = current(document);
      if (!parsedStart || !parsedEnd || parsedStart <= this.clock() || parsedStart >= parsedEnd || !purpose.trim() || !activity.trim() || !place.trim()) {
        throw new InvalidGathering("Change at least one detail to valid future gathering details.");
      }
      const changed = purpose.trim() !== previous.purpose || activity.trim() !== previous.activity || place.trim() !== previous.place
        || parsedStart.getTime() !== previous.start.getTime() || parsedEnd.getTime() !== previous.end.getTime();
      if (!changed) throw new InvalidGathering("Change at least one detail to valid future gathering details.");
      if (await conflicting(this.gatherings, [user], parsedStart, parsedEnd, gathering, session)) {
        throw new GatheringConflict("A participant has a conflicting confirmed gathering.");
      }
      const affectedUsers = Object.keys(previous.responses).filter((member) => member !== user);
      const version = crypto.randomUUID();
      const next: Version = { version, number: previous.number + 1, purpose: purpose.trim(), activity: activity.trim(), place: place.trim(),
        start: parsedStart, end: parsedEnd,
        responses: Object.fromEntries([[user, "ACCEPTED"], ...affectedUsers.map((member) => [member, "PENDING"])]) as Record<string, ResponseStatus> };
      const result = await this.gatherings.updateOne(
        { _id: gathering, currentVersion: expectedVersion, status: { $in: ["PROPOSED", "CONFIRMED"] } },
        { $push: { versions: next }, $set: { currentVersion: version, currentStart: parsedStart, currentEnd: parsedEnd, status: "PROPOSED", attendees: [] } },
        { session },
      );
      if (!result.modifiedCount) throw new StaleGathering("Refresh to review the current gathering.");
      await queueNotices(this.db, session, { recipients: affectedUsers, message: "The gathering changed; review and respond to the new version", destination: `/gatherings/${gathering}` });
      return { version, affectedUsers };
    });
  }

  async accept({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    return serializedCommitmentChange(this.db, this.control, async (session) => {
      const document = await this.gatherings.findOne({ _id: gathering }, { session });
      if (!document || document.status === "CANCELLED" || document.currentVersion !== version || current(document).start <= this.clock()) {
        throw new StaleGathering("Refresh to review the current gathering.");
      }
      const response = current(document).responses[user];
      if (!response || response === "ACCEPTED") throw new GatheringForbidden("You cannot respond to this invitation.");
      if (await conflicting(this.gatherings, [user], document.currentStart, document.currentEnd, gathering, session)) {
        throw new GatheringConflict("A participant has a conflicting confirmed gathering.");
      }
      const joined = document.status === "CONFIRMED";
      const affectedUsers = joined ? [...document.attendees] : [document.organizer];
      const path = `versions.$[version].responses.${user}`;
      const result = await this.gatherings.updateOne(
        { _id: gathering, status: document.status, currentVersion: version, versions: { $elemMatch: { version, [`responses.${user}`]: { $in: ["PENDING", "DECLINED", "WITHDRAWN"] } } } },
        { $set: { [path]: "ACCEPTED" }, ...(joined ? { $addToSet: { attendees: user } } : {}) },
        { arrayFilters: [{ "version.version": version }], session },
      );
      if (!result.modifiedCount) throw new StaleGathering("Refresh to review the current gathering.");
      await queueNotices(this.db, session, { recipients: affectedUsers, message: joined ? "A participant joined the confirmed gathering" : "An invitee accepted your proposal", destination: `/gatherings/${gathering}` });
      return { joined, affectedUsers };
    });
  }

  async decline({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    return serializedCommitmentChange(this.db, this.control, async (session) => {
    const document = await this.gatherings.findOne({ _id: gathering }, { session });
    if (!document || document.status === "CANCELLED" || document.currentVersion !== version || current(document).start <= this.clock()) {
      throw new StaleGathering("Refresh to review the current gathering.");
    }
    const path = `versions.$[version].responses.${user}`;
    const result = await this.gatherings.updateOne(
      { _id: gathering, status: { $in: ["PROPOSED", "CONFIRMED"] }, currentVersion: version, versions: { $elemMatch: { version, [`responses.${user}`]: "PENDING" } } },
      { $set: { [path]: "DECLINED" } }, { arrayFilters: [{ "version.version": version }], session },
    );
    if (!result.modifiedCount) throw new GatheringForbidden("You cannot respond to this invitation.");
    await queueNotices(this.db, session, { recipients: [document.organizer], message: "An invitee declined the gathering", destination: `/gatherings/${gathering}` });
    return {};
    });
  }

  async withdraw({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    return serializedCommitmentChange(this.db, this.control, async (session) => {
      const document = await this.gatherings.findOne({ _id: gathering }, { session });
      if (!document || document.status === "CANCELLED" || document.currentVersion !== version || current(document).start <= this.clock()) {
        throw new StaleGathering("Refresh to review the current gathering.");
      }
      if (user === document.organizer || current(document).responses[user] !== "ACCEPTED") {
        throw new GatheringForbidden("Only an accepted invitee can withdraw.");
      }
      const remaining = document.attendees.filter((member) => member !== user);
      const closing = document.status === "CONFIRMED" && remaining.length === 1
        && remaining[0] === document.organizer && !Object.values(current(document).responses).includes("PENDING");
      const status: GatheringStatus = closing ? "CANCELLED" : document.status;
      const affectedUsers = document.status === "PROPOSED" ? [document.organizer]
        : closing ? Object.keys(current(document).responses).filter((member) => member !== user) : remaining;
      const path = `versions.$[version].responses.${user}`;
      const changed = await this.gatherings.updateOne(
        { _id: gathering, currentVersion: version, status: document.status,
          versions: { $elemMatch: { version, [`responses.${user}`]: "ACCEPTED" } } },
        { $set: { [path]: "WITHDRAWN", status, attendees: closing ? [] : remaining } },
        { arrayFilters: [{ "version.version": version }], session },
      );
      if (!changed.modifiedCount) throw new StaleGathering("Refresh to review the current gathering.");
      await queueNotices(this.db, session, { recipients: affectedUsers,
        message: closing ? "The gathering closed because only the organizer remained and no invitations were pending" : "A participant has withdrawn from the gathering",
        destination: `/gatherings/${gathering}` });
      return { affectedUsers, status };
    });
  }

  async cancel({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    return serializedCommitmentChange(this.db, this.control, async (session) => {
      const document = await this.gatherings.findOne({ _id: gathering }, { session });
      if (!document || document.organizer !== user) throw new GatheringForbidden("Only the organizer can cancel.");
      if (document.status === "CANCELLED" || document.currentVersion !== version || current(document).start <= this.clock()) {
        throw new StaleGathering("Refresh to review the current gathering.");
      }
      const affectedUsers = Object.keys(current(document).responses).filter((member) => member !== user);
      const changed = await this.gatherings.updateOne(
        { _id: gathering, currentVersion: version, status: { $in: ["PROPOSED", "CONFIRMED"] } },
        { $set: { status: "CANCELLED", attendees: [] } }, { session },
      );
      if (!changed.modifiedCount) throw new StaleGathering("Refresh to review the current gathering.");
      await queueNotices(this.db, session, { recipients: affectedUsers, message: "The gathering has been cancelled", destination: `/gatherings/${gathering}` });
      return { affectedUsers };
    });
  }

  async confirm({ user, gathering, version, expectedAttendees }: { user: string; gathering: string; version: string; expectedAttendees: string[] }) {
    return serializedCommitmentChange(this.db, this.control, async (session) => {
      const document = await this.gatherings.findOne({ _id: gathering }, { session });
      if (!document || document.organizer !== user) throw new GatheringForbidden("Only the organizer can confirm.");
      if (document.status !== "PROPOSED" || document.currentVersion !== version || current(document).start <= this.clock()) {
        throw new StaleGathering("Refresh the accepted roster before confirming.");
      }
      const accepted = Object.entries(current(document).responses).filter(([, status]) => status === "ACCEPTED").map(([member]) => member);
      if (accepted.length < 2 || !sameUsers(accepted, expectedAttendees)) {
        throw new StaleGathering("Refresh the accepted roster before confirming.");
      }
      if (await conflicting(this.gatherings, accepted, document.currentStart, document.currentEnd, gathering, session)) {
        throw new GatheringConflict("A participant has a conflicting confirmed gathering.");
      }
      const changed = await this.gatherings.updateOne(
        { _id: gathering, status: "PROPOSED", currentVersion: version },
        { $set: { status: "CONFIRMED", attendees: accepted } }, { session },
      );
      if (!changed.modifiedCount) throw new StaleGathering("Refresh the accepted roster before confirming.");
      await queueNotices(this.db, session, { recipients: accepted.filter((member) => member !== user), message: "Your gathering has been confirmed", destination: `/gatherings/${gathering}` });
      return { attendees: accepted };
    });
  }

  async _get({ gathering }: { gathering: string }) {
    const document = await this.gatherings.findOne({ _id: gathering });
    if (!document) return [];
    const version = current(document);
    return [{ organizer: document.organizer, context: document.context, version: version.version,
      purpose: version.purpose, activity: version.activity, place: version.place,
      start: version.start.toISOString(), end: version.end.toISOString(), status: document.status,
      invitees: Object.keys(version.responses).filter((user) => user !== document.organizer),
      accepted: Object.entries(version.responses).filter(([, status]) => status === "ACCEPTED").map(([user]) => user),
      attendees: document.attendees }];
  }

  async _contextFor({ gathering }: { gathering: string }) {
    const document = await this.gatherings.findOne({ _id: gathering }, { projection: { context: 1 } });
    return document ? [{ context: document.context }] : [];
  }

  async _visibleTo({ user, gathering }: { user: string; gathering: string }) {
    const document = await this.gatherings.findOne({ _id: gathering });
    return { allowed: Boolean(document && current(document).responses[user]) };
  }

  async _listFor({ user }: { user: string }) {
    const found = await this.gatherings.find({}).toArray();
    const gatherings = found.filter((document) => Boolean(current(document).responses[user]))
      .map((document) => { const version = current(document); return {
        gathering: document._id, organizer: document.organizer, context: document.context, version: version.version,
        number: version.number,
        purpose: version.purpose, activity: version.activity, place: version.place,
        start: version.start.toISOString(), end: version.end.toISOString(), status: document.status,
        myResponse: version.responses[user]!,
        invitees: Object.keys(version.responses).filter((member) => member !== document.organizer),
        accepted: Object.entries(version.responses).filter(([, response]) => response === "ACCEPTED").map(([member]) => member),
        pending: Object.entries(version.responses).filter(([, response]) => response === "PENDING").map(([member]) => member),
        declined: Object.entries(version.responses).filter(([, response]) => response === "DECLINED").map(([member]) => member),
        withdrawn: Object.entries(version.responses).filter(([, response]) => response === "WITHDRAWN").map(([member]) => member),
        attendees: document.attendees,
      }; }).sort((a, b) => a.start.localeCompare(b.start));
    return { gatherings };
  }

  async _commitmentsFor({ users, from, to, now }: { users: string[]; from: string; to: string; now: Date }) {
    const lower = Math.max(instant(from)?.getTime() ?? Number.NaN, now.getTime());
    const upper = instant(to)?.getTime() ?? Number.NaN;
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) return { commitments: [] as { owner: string; start: string; end: string }[] };
    const found = await this.gatherings.find({ status: "CONFIRMED", attendees: { $in: users }, currentStart: { $lt: new Date(upper) }, currentEnd: { $gt: new Date(lower) } }).toArray();
    return { commitments: found.flatMap((document) => document.attendees.filter((member) => users.includes(member)).map((owner) => ({
      owner, start: new Date(Math.max(document.currentStart.getTime(), lower)).toISOString(),
      end: new Date(Math.min(document.currentEnd.getTime(), upper)).toISOString(),
    }))) };
  }
}
