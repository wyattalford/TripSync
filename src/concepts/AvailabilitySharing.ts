import { MongoServerError, type ClientSession, type Collection, type Db } from "mongodb";
import { readOverlapSnapshot } from "../overlapSnapshot.ts";

export class InvalidOpening extends Error {}
export class OpeningConflict extends Error {}
export class OpeningForbidden extends Error {}

type Opening = {
  opening: string;
  purpose: string;
  start: Date;
  end: Date;
  audiences: string[];
};

type OwnerDocument = { _id: string; revision: number; openings: Opening[] };
type Change = (openings: Opening[]) => Opening[];

const ABSOLUTE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function instant(value: string): Date | null {
  if (!ABSOLUTE_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

async function changeOwner(collection: Collection<OwnerDocument>, owner: string, change: Change, createIfMissing = false): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let current = await collection.findOne({ _id: owner });
    if (!current) {
      if (!createIfMissing) throw new OpeningForbidden("You cannot change this opening.");
      try {
        await collection.insertOne({ _id: owner, revision: 0, openings: [] });
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11_000)) throw error;
      }
      current = await collection.findOne({ _id: owner });
      if (!current) continue;
    }
    const next = change(current.openings);
    const result = await collection.updateOne(
      { _id: owner, revision: current.revision },
      { $set: { openings: next }, $inc: { revision: 1 } },
    );
    if (result.modifiedCount === 1) return;
  }
  throw new Error("Could not update openings after concurrent changes.");
}

function ownedOpening(openings: Opening[], opening: string): Opening {
  const found = openings.find((item) => item.opening === opening);
  if (!found) throw new OpeningForbidden("You cannot change this opening.");
  return found;
}

async function sharedIntervals(owners: Collection<OwnerDocument>, audience: string, purpose: string, from: string, to: string, now: Date, session?: ClientSession) {
  const matchingPurpose = purpose.trim();
  const lower = Math.max(instant(from)?.getTime() ?? Number.NaN, now.getTime());
  const upper = instant(to)?.getTime() ?? Number.NaN;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) return [];
  const found = await owners.find({ "openings.audiences": audience }, { session }).toArray();
  return found.flatMap((owner) => owner.openings.filter((opening) => opening.purpose === matchingPurpose && opening.audiences.includes(audience))
    .map((opening) => ({ owner: owner._id, start: Math.max(opening.start.getTime(), lower), end: Math.min(opening.end.getTime(), upper) }))
    .filter(({ start, end }) => start < end)
    .map(({ owner: member, start, end }) => ({ owner: member, start: new Date(start).toISOString(), end: new Date(end).toISOString() })));
}

export function readSharedIntervals(db: Db, audience: string, purpose: string, from: string, to: string, now: Date, session?: ClientSession) {
  return sharedIntervals(db.collection<OwnerDocument>("availabilitySharing.owners"), audience, purpose, from, to, now, session);
}

export class AvailabilitySharingConcept {
  private readonly owners: Collection<OwnerDocument>;

  constructor(private readonly db: Db, private readonly clock: () => Date = () => new Date()) {
    this.owners = db.collection<OwnerDocument>("availabilitySharing.owners");
  }

  async create({ owner, purpose, start, end }: { owner: string; purpose: string; start: string; end: string }) {
    const parsedStart = instant(start);
    const parsedEnd = instant(end);
    const cleanedPurpose = purpose.trim();
    if (!cleanedPurpose || !parsedStart || !parsedEnd || parsedStart >= parsedEnd || parsedEnd <= this.clock()) {
      throw new InvalidOpening("Enter a purpose and a valid future-ending time range.");
    }
    const opening = crypto.randomUUID();
    await changeOwner(this.owners, owner, (existing) => {
      if (existing.some((item) => overlaps(item, { start: parsedStart, end: parsedEnd }))) {
        throw new OpeningConflict("Your openings cannot overlap.");
      }
      return [...existing, { opening, purpose: cleanedPurpose, start: parsedStart, end: parsedEnd, audiences: [] }];
    }, true);
    return { opening };
  }

  async publish({ user, opening, audiences }: { user: string; opening: string; audiences: string[] }) {
    const selected = [...new Set(audiences)];
    await changeOwner(this.owners, user, (existing) => {
      ownedOpening(existing, opening);
      return existing.map((item) => item.opening === opening ? { ...item, audiences: selected } : item);
    });
    return {};
  }

  async revise({ user, opening, purpose, start, end, audiences }: { user: string; opening: string; purpose: string; start: string; end: string; audiences: string[] }) {
    const parsedStart = instant(start);
    const parsedEnd = instant(end);
    const cleanedPurpose = purpose.trim();
    const selected = [...new Set(audiences)];
    await changeOwner(this.owners, user, (existing) => {
      const previous = ownedOpening(existing, opening);
      if (!cleanedPurpose || !parsedStart || !parsedEnd || parsedStart >= parsedEnd || parsedEnd <= this.clock() || previous.end <= this.clock()) {
        throw new InvalidOpening("Change at least one detail of an active opening to a valid interval.");
      }
      const changed = cleanedPurpose !== previous.purpose || parsedStart.getTime() !== previous.start.getTime()
        || parsedEnd.getTime() !== previous.end.getTime()
        || selected.length !== previous.audiences.length || selected.some((audience) => !previous.audiences.includes(audience));
      if (!changed) throw new InvalidOpening("Change at least one detail of an active opening to a valid interval.");
      if (existing.some((item) => item.opening !== opening && overlaps(item, { start: parsedStart, end: parsedEnd }))) {
        throw new OpeningConflict("Your openings cannot overlap.");
      }
      return existing.map((item) => item.opening === opening
        ? { opening, purpose: cleanedPurpose, start: parsedStart, end: parsedEnd, audiences: selected }
        : item);
    });
    return {};
  }

  async withdraw({ user, opening }: { user: string; opening: string }) {
    await changeOwner(this.owners, user, (existing) => {
      ownedOpening(existing, opening);
      return existing.filter((item) => item.opening !== opening);
    });
    return {};
  }

  async _owned({ user }: { user: string }) {
    const current = await this.owners.findOne({ _id: user });
    return (current?.openings ?? []).map((item) => ({
      opening: item.opening, purpose: item.purpose, start: item.start.toISOString(), end: item.end.toISOString(), audiences: item.audiences,
    })).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  }

  async _sharedWith({ audience, purpose, from, to }: { audience: string; purpose: string; from: string; to: string }) {
    return sharedIntervals(this.owners, audience, purpose, from, to, this.clock());
  }

  async _sharedSnapshot({ audience, purpose, from, to, now }: { audience: string; purpose: string; from: string; to: string; now: Date }) {
    return { intervals: await sharedIntervals(this.owners, audience, purpose, from, to, now) };
  }

  async _ownedSnapshot({ user }: { user: string }) {
    return { openings: await this._owned({ user }) };
  }

  async _overlapSnapshot({ user, group, purpose, from, to, duration, now }: {
    user: string; group: string; purpose: string; from: string; to: string; duration: number; now: Date;
  }) {
    return readOverlapSnapshot(this.db, { user, group, purpose, from, to, duration, now });
  }
}
