import type { Collection, Db, ClientSession } from "mongodb";

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
    if (await conflicting(this.gatherings, [organizer], parsedStart, parsedEnd)) {
      throw new GatheringConflict("A participant has a conflicting confirmed gathering.");
    }
    const gathering = crypto.randomUUID(), version = crypto.randomUUID();
    await this.control.updateOne({ _id: "commitments" }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    await this.gatherings.insertOne({
      _id: gathering, organizer, context, status: "PROPOSED", currentVersion: version,
      currentStart: parsedStart, currentEnd: parsedEnd, attendees: [],
      versions: [{ version, number: 1, purpose: purpose.trim(), activity: activity.trim(), place: place.trim(),
        start: parsedStart, end: parsedEnd,
        responses: Object.fromEntries([[organizer, "ACCEPTED"], ...selected.map((user) => [user, "PENDING"])]) as Record<string, ResponseStatus> }],
    });
    return { gathering, version };
  }

  async accept({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    const document = await this.gatherings.findOne({ _id: gathering });
    if (!document || document.status !== "PROPOSED" || document.currentVersion !== version || current(document).start <= this.clock()) {
      throw new StaleGathering("Refresh to review the current gathering.");
    }
    const response = current(document).responses[user];
    if (!response || response === "ACCEPTED") throw new GatheringForbidden("You cannot respond to this invitation.");
    if (await conflicting(this.gatherings, [user], document.currentStart, document.currentEnd, gathering)) {
      throw new GatheringConflict("A participant has a conflicting confirmed gathering.");
    }
    const path = `versions.$[version].responses.${user}`;
    const result = await this.gatherings.updateOne(
      { _id: gathering, status: "PROPOSED", currentVersion: version, versions: { $elemMatch: { version, [`responses.${user}`]: { $in: ["PENDING", "DECLINED", "WITHDRAWN"] } } } },
      { $set: { [path]: "ACCEPTED" } },
      { arrayFilters: [{ "version.version": version }] },
    );
    if (!result.modifiedCount) throw new StaleGathering("Refresh to review the current gathering.");
    return { joined: false, affectedUsers: [document.organizer] };
  }

  async decline({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    const document = await this.gatherings.findOne({ _id: gathering });
    if (!document || document.status !== "PROPOSED" || document.currentVersion !== version || current(document).start <= this.clock()) {
      throw new StaleGathering("Refresh to review the current gathering.");
    }
    const path = `versions.$[version].responses.${user}`;
    const result = await this.gatherings.updateOne(
      { _id: gathering, status: "PROPOSED", currentVersion: version, versions: { $elemMatch: { version, [`responses.${user}`]: "PENDING" } } },
      { $set: { [path]: "DECLINED" } }, { arrayFilters: [{ "version.version": version }] },
    );
    if (!result.modifiedCount) throw new GatheringForbidden("You cannot respond to this invitation.");
    return {};
  }

  async confirm({ user, gathering, version, expectedAttendees }: { user: string; gathering: string; version: string; expectedAttendees: string[] }) {
    const session = this.db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        await this.control.updateOne({ _id: "commitments" }, { $inc: { revision: 1 } }, { session });
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
        return { attendees: accepted };
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally { await session.endSession(); }
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

  async _visibleTo({ user, gathering }: { user: string; gathering: string }) {
    const document = await this.gatherings.findOne({ _id: gathering });
    return { allowed: Boolean(document && current(document).responses[user]) };
  }

  async _listFor({ user }: { user: string }) {
    const found = await this.gatherings.find({}).toArray();
    const gatherings = found.filter((document) => Boolean(current(document).responses[user]))
      .map((document) => { const version = current(document); return {
        gathering: document._id, organizer: document.organizer, context: document.context, version: version.version,
        purpose: version.purpose, activity: version.activity, place: version.place,
        start: version.start.toISOString(), end: version.end.toISOString(), status: document.status,
        myResponse: version.responses[user]!,
        invitees: Object.keys(version.responses).filter((member) => member !== document.organizer),
        accepted: Object.entries(version.responses).filter(([, response]) => response === "ACCEPTED").map(([member]) => member),
        pending: Object.entries(version.responses).filter(([, response]) => response === "PENDING").map(([member]) => member),
        declined: Object.entries(version.responses).filter(([, response]) => response === "DECLINED").map(([member]) => member),
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
