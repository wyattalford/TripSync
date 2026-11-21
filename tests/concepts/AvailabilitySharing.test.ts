import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  AvailabilitySharingConcept, InvalidOpening, OpeningConflict, OpeningForbidden, OpeningNotFound,
} from "../../src/concepts/AvailabilitySharing.ts";
import * as overlapSnapshot from "../../src/overlapSnapshot.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for AvailabilitySharing tests.");
const databaseName = `opentime_availability_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const client = new MongoClient(testUrl.toString());
let db: Db;
let now: Date;
let availability: AvailabilitySharingConcept;

const baseTime = Date.parse("2030-01-01T12:00:00.000Z");
function at(hours: number): string {
  return new Date(baseTime + hours * 3_600_000).toISOString();
}

async function resetTestDatabase() {
  if (db.databaseName !== databaseName || !databaseName.startsWith("opentime_availability_")) {
    throw new Error("Refusing to reset another database.");
  }
  await db.dropDatabase();
}

async function expectUnchanged(action: () => Promise<unknown>, error: new (message?: string) => Error) {
  const before = await db.collection("availabilitySharing.owners").find().sort({ _id: 1 }).toArray();
  await expect(action()).rejects.toBeInstanceOf(error);
  expect(await db.collection("availabilitySharing.owners").find().sort({ _id: 1 }).toArray()).toEqual(before);
}

describe("AvailabilitySharing", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => {
    await resetTestDatabase();
    now = new Date(baseTime);
    availability = new AvailabilitySharingConcept(db, () => now);
  });
  afterAll(async () => { await resetTestDatabase(); await client.close(); });

  test("creates private openings, orders owned queries, and permits adjacent ranges and other owners", async () => {
    expect(await availability._owned({ user: "alice" })).toEqual([]);
    expect(await availability._ownedSnapshot({ user: "alice" })).toEqual({ openings: [] });
    const later = await availability.create({ owner: "alice", start: at(4), end: at(5) });
    const earlier = await availability.create({ owner: "alice", start: at(1), end: at(3) });
    const adjacent = await availability.create({ owner: "alice", start: at(3), end: at(4) });
    const other = await availability.create({ owner: "bob", start: at(1), end: at(3) });
    expect(new Set([later.opening, earlier.opening, adjacent.opening, other.opening]).size).toBe(4);
    const expected = [
      { opening: earlier.opening, start: at(1), end: at(3), audiences: [] },
      { opening: adjacent.opening, start: at(3), end: at(4), audiences: [] },
      { opening: later.opening, start: at(4), end: at(5), audiences: [] },
    ];
    expect(await availability._owned({ user: "alice" })).toEqual(expected);
    expect(await availability._ownedSnapshot({ user: "alice" })).toEqual({ openings: expected });
    expect(await availability._owned({ user: "bob" })).toEqual([
      { opening: other.opening, start: at(1), end: at(3), audiences: [] },
    ]);
    expect(await availability._sharedWith({ audience: "group", from: at(0), to: at(6) })).toEqual([]);
  });

  test("rejects invalid and overlapping creates without changing any stored state", async () => {
    await availability.create({ owner: "alice", start: at(2), end: at(4) });
    for (const [start, end] of [
      ["invalid", at(3)], [at(1), "invalid"], ["2030-01-01T13:00:00", at(3)],
      [at(2), at(2)], [at(4), at(2)], [at(-2), at(0)], [at(-2), at(-1)],
    ]) {
      await expectUnchanged(() => availability.create({ owner: "alice", start, end }), InvalidOpening);
    }
    for (const [start, end] of [[at(1), at(3)], [at(3), at(5)], [at(1), at(5)], [at(2), at(4)]]) {
      await expectUnchanged(() => availability.create({ owner: "alice", start, end }), OpeningConflict);
    }
    await expectUnchanged(() => availability.create({ owner: "new-user", start: at(1), end: at(1) }), InvalidOpening);
  });

  test("publishes, replaces and clears audiences without affecting other openings", async () => {
    const { opening } = await availability.create({ owner: "alice", start: at(1), end: at(3) });
    const second = await availability.create({ owner: "alice", start: at(3), end: at(4) });
    expect(await availability.publish({ user: "alice", opening, audiences: ["a", "b", "a"] })).toEqual({});
    expect(await availability.publish({ user: "alice", opening, audiences: ["a", "b"] })).toEqual({});
    const range = { from: at(0), to: at(5) };
    const interval = [{ owner: "alice", start: at(1), end: at(3) }];
    expect(await availability._sharedWith({ audience: "a", ...range })).toEqual(interval);
    expect(await availability._sharedWith({ audience: "b", ...range })).toEqual(interval);
    expect((await availability._owned({ user: "alice" }))[0]!.audiences).toEqual(["a", "b"]);
    await availability.publish({ user: "alice", opening, audiences: ["c"] });
    expect(await availability._sharedWith({ audience: "a", ...range })).toEqual([]);
    expect(await availability._sharedWith({ audience: "c", ...range })).toEqual(interval);
    await availability.publish({ user: "alice", opening: second.opening, audiences: ["c"] });
    await availability.publish({ user: "alice", opening, audiences: [] });
    expect(await availability._sharedWith({ audience: "c", ...range })).toEqual([
      { owner: "alice", start: at(3), end: at(4) },
    ]);
  });

  test("revises time and audiences and makes changes visible in owned and shared queries", async () => {
    const { opening } = await availability.create({ owner: "alice", start: at(1), end: at(2) });
    await availability.publish({ user: "alice", opening, audiences: ["a"] });
    expect(await availability.revise({ user: "alice", opening, start: at(2), end: at(4), audiences: ["b", "b"] })).toEqual({});
    expect(await availability._ownedSnapshot({ user: "alice" })).toEqual({
      openings: [{ opening, start: at(2), end: at(4), audiences: ["b"] }],
    });
    expect(await availability._sharedWith({ audience: "a", from: at(0), to: at(5) })).toEqual([]);
    expect(await availability._sharedWith({ audience: "b", from: at(0), to: at(5) })).toEqual([
      { owner: "alice", start: at(2), end: at(4) },
    ]);
    await availability.revise({ user: "alice", opening, start: at(2), end: at(4), audiences: [] });
    expect(await availability._sharedWith({ audience: "b", from: at(0), to: at(5) })).toEqual([]);
  });

  test("rejects invalid, unchanged, conflicting and ended revisions without changing state", async () => {
    const { opening } = await availability.create({ owner: "alice", start: at(1), end: at(3) });
    await availability.create({ owner: "alice", start: at(4), end: at(6) });
    await availability.publish({ user: "alice", opening, audiences: ["a", "b"] });
    for (const [start, end, audiences] of [
      [at(1), at(3), ["a", "b"]], [at(1), at(3), ["b", "a", "a"]],
      ["invalid", at(3), []], [at(1), "invalid", []], [at(1), at(1), []],
      [at(3), at(1), []], [at(-1), at(0), []],
    ] as [string, string, string[]][]) {
      await expectUnchanged(() => availability.revise({ user: "alice", opening, start, end, audiences }), InvalidOpening);
    }
    await expectUnchanged(() => availability.revise({
      user: "alice", opening, start: at(2), end: at(5), audiences: ["c"],
    }), OpeningConflict);
    now = new Date(at(3));
    await expectUnchanged(() => availability.revise({
      user: "alice", opening, start: at(3), end: at(4), audiences: ["c"],
    }), InvalidOpening);
    expect(await availability._owned({ user: "alice" })).toHaveLength(2);
  });

  test("enforces existence and ownership for every mutation and preserves state after refusal", async () => {
    const { opening } = await availability.create({ owner: "alice", start: at(1), end: at(2) });
    await availability.create({ owner: "bob", start: at(1), end: at(2) });
    await availability.publish({ user: "alice", opening, audiences: ["a"] });
    const actions = [
      (user: string, id: string) => availability.publish({ user, opening: id, audiences: ["b"] }),
      (user: string, id: string) => availability.revise({ user, opening: id, start: "invalid", end: at(3), audiences: [] }),
      (user: string, id: string) => availability.withdraw({ user, opening: id }),
    ];
    for (const action of actions) {
      for (const user of ["alice", "bob", "no-openings"]) {
        await expectUnchanged(() => action(user, "missing"), OpeningNotFound);
      }
      for (const user of ["bob", "no-openings"]) {
        await expectUnchanged(() => action(user, opening), OpeningForbidden);
      }
    }
    expect(await availability.withdraw({ user: "alice", opening })).toEqual({});
    for (const action of actions) await expectUnchanged(() => action("alice", opening), OpeningNotFound);
    expect(await availability._owned({ user: "alice" })).toEqual([]);
    expect(await availability._sharedWith({ audience: "a", from: at(0), to: at(3) })).toEqual([]);
    const replacement = await availability.create({ owner: "alice", start: at(1), end: at(2) });
    expect(replacement.opening).not.toBe(opening);
  });

  test("clips shared intervals to the range and supplied clock and excludes expired openings", async () => {
    const first = await availability.create({ owner: "alice", start: "2030-01-01T13:00:00+02:00", end: at(2) });
    const second = await availability.create({ owner: "bob", start: at(1), end: at(4) });
    await availability.publish({ user: "alice", opening: first.opening, audiences: ["a"] });
    await availability.publish({ user: "bob", opening: second.opening, audiences: ["a"] });
    const range = { audience: "a", from: at(-2), to: at(3) };
    const expected = [
      { owner: "alice", start: at(0), end: at(2) },
      { owner: "bob", start: at(1), end: at(3) },
    ];
    expect((await availability._sharedWith(range)).sort((a, b) => a.owner.localeCompare(b.owner))).toEqual(expected);
    const initialSnapshot = await availability._sharedSnapshot({ ...range, now: new Date(at(0)) });
    expect(initialSnapshot.intervals.sort((a, b) => a.owner.localeCompare(b.owner))).toEqual(expected);
    expect(await availability._sharedSnapshot({ ...range, from: at(1.5), to: at(2.5), now: new Date(at(0)) })).toEqual({
      intervals: [
        { owner: "alice", start: at(1.5), end: at(2) },
        { owner: "bob", start: at(1.5), end: at(2.5) },
      ],
    });
    now = new Date(at(2));
    expect(await availability._sharedWith(range)).toEqual([{ owner: "bob", start: at(2), end: at(3) }]);
    expect(await availability._owned({ user: "alice" })).toEqual([
      { opening: first.opening, start: at(-1), end: at(2), audiences: ["a"] },
    ]);
    await availability.publish({ user: "alice", opening: first.opening, audiences: ["b"] });
    expect(await availability._sharedWith({ audience: "b", from: at(-2), to: at(3) })).toEqual([]);
    await availability.withdraw({ user: "alice", opening: first.opening });
    expect(await availability._owned({ user: "alice" })).toEqual([]);
    expect(await availability._sharedSnapshot({ ...range, now: new Date(at(4)) })).toEqual({ intervals: [] });
    for (const [from, to] of [[at(1), at(1)], [at(2), at(1)], ["bad", at(2)], [at(1), "bad"]]) {
      expect(await availability._sharedWith({ audience: "a", from, to })).toEqual([]);
      expect(await availability._sharedSnapshot({ audience: "a", from, to, now })).toEqual({ intervals: [] });
    }
    expect(await availability._sharedWith({ audience: "other", from: at(0), to: at(5) })).toEqual([]);
  });

  test("serializes concurrent conflicting creates and revisions", async () => {
    const createResults = await Promise.allSettled([
      availability.create({ owner: "alice", start: at(1), end: at(3) }),
      availability.create({ owner: "alice", start: at(2), end: at(4) }),
    ]);
    expect(createResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(createResults.filter((result) => result.status === "rejected" && result.reason instanceof OpeningConflict)).toHaveLength(1);
    const first = (await availability._owned({ user: "alice" }))[0]!;
    const second = await availability.create({ owner: "alice", start: at(5), end: at(6) });
    const revisions = await Promise.allSettled([
      availability.revise({ user: "alice", opening: first.opening, start: at(1), end: at(4.5), audiences: [] }),
      availability.revise({ user: "alice", opening: second.opening, start: at(4), end: at(6), audiences: [] }),
    ]);
    expect(revisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(revisions.filter((result) => result.status === "rejected" && result.reason instanceof OpeningConflict)).toHaveLength(1);
    const owned = await availability._owned({ user: "alice" });
    expect(owned).toHaveLength(2);
    expect(owned[0]!.end <= owned[1]!.start).toBe(true);
  });

  test("delegates overlap snapshot queries and propagates coordinator failures", async () => {
    const search = { user: "alice", group: "group", from: at(1), to: at(5), duration: 60, now: new Date(at(0)) };
    const result = {
      allowed: true, overlaps: [], suggestions: [{
        start: at(1), end: at(5), availableCount: 2, totalCount: 3,
        unavailable: [{ user: "carol", username: "carol" }],
      }],
    };
    const read = spyOn(overlapSnapshot, "readOverlapSnapshot").mockResolvedValue(result);
    try {
      expect(await availability._overlapSnapshot(search)).toEqual(result);
      expect(read).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledWith(db, search);
      const failure = new Error("snapshot failed");
      read.mockRejectedValue(failure);
      await expect(availability._overlapSnapshot(search)).rejects.toBe(failure);
    } finally {
      read.mockRestore();
    }
  });
});
