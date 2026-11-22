import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  GatheringConcept, GatheringConflict, GatheringForbidden, InvalidGathering, StaleGathering,
} from "../../src/concepts/Gathering.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for Gathering tests.");
const url = new URL(configuredUrl);
const databaseName = `opentime_gathering_${crypto.randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${databaseName}`;
const client = new MongoClient(url.toString());
let db: Db;
let gatheringConcept: GatheringConcept;
let now: Date;

const baseTime = Date.parse("2030-01-01T12:00:00.000Z");
const at = (hours: number) => new Date(baseTime + hours * 3_600_000).toISOString();
const details = { purpose: "Study", activity: "Review notes", place: "Library", start: at(2), end: at(4) };
type Reference = { gathering: string; version: string };

async function reset() {
  if (db.databaseName !== databaseName) throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function propose(invitees = ["bob", "carol"], organizer = "alice", time = details) {
  return gatheringConcept.propose({ ...time, organizer, context: "friends", invitees });
}

const accept = (ref: Reference, user = "bob") => gatheringConcept.accept({ ...ref, user });
const confirm = (ref: Reference, expectedAttendees = ["alice", "bob"]) =>
  gatheringConcept.confirm({ ...ref, user: "alice", expectedAttendees });
const commitments = (users = ["alice", "bob", "carol"]) =>
  gatheringConcept._commitmentsFor({ users, from: at(0), to: at(8), now });

describe("Gathering", () => {
  beforeAll(async () => { await client.connect(); db = client.db(databaseName); });
  beforeEach(async () => {
    await reset();
    now = new Date(baseTime);
    gatheringConcept = new GatheringConcept(db, () => now);
  });
  afterAll(async () => { await reset(); await client.close(); });

  test("principle: acceptance permits confirmation and pending invitees can join the confirmed version", async () => {
    const ref = await propose();
    expect(await gatheringConcept._get(ref)).toEqual([{
      ...details, organizer: "alice", context: "friends", version: ref.version, status: "PROPOSED",
      invitees: ["bob", "carol"], accepted: ["alice"], attendees: [],
    }]);
    expect(await gatheringConcept._contextFor(ref)).toEqual([{ context: "friends" }]);
    expect(await commitments()).toEqual({ commitments: [] });
    expect(await accept(ref)).toEqual({ joined: false, affectedUsers: ["alice"] });
    expect(await commitments()).toEqual({ commitments: [] });
    expect(await confirm(ref, ["bob", "alice"])).toEqual({ attendees: ["alice", "bob"] });
    expect((await gatheringConcept._listFor({ user: "carol" })).gatherings).toMatchObject([
      { status: "CONFIRMED", myResponse: "PENDING", pending: ["carol"], attendees: ["alice", "bob"] },
    ]);
    expect(await commitments(["carol"])).toEqual({ commitments: [] });
    expect(await accept(ref, "carol")).toEqual({ joined: true, affectedUsers: ["alice", "bob"] });
    expect(await commitments(["carol"])).toEqual({ commitments: [{ owner: "carol", start: at(2), end: at(4) }] });
    expect(await gatheringConcept._get(ref)).toMatchObject([{ attendees: ["alice", "bob", "carol"] }]);
  });

  test("rejects invalid proposals and scopes participation queries", async () => {
    for (const input of [
      { invitees: [] }, { invitees: ["alice"] }, { start: at(0) }, { end: at(2) },
      { start: "2030-01-01T14:00:00" }, { purpose: " " }, { activity: "" }, { place: "" },
    ]) {
      await expect(gatheringConcept.propose({
        ...details, organizer: "alice", context: "friends", invitees: ["bob"], ...input,
      })).rejects.toBeInstanceOf(InvalidGathering);
    }
    expect(await gatheringConcept._listFor({ user: "alice" })).toEqual({ gatherings: [] });
    const later = await propose(["bob"], "alice", { ...details, start: at(5), end: at(6) });
    const earlier = await propose(["bob"]);
    await propose(["dana"], "erin");
    expect(await gatheringConcept._visibleTo({ ...earlier, user: "bob" })).toEqual({ allowed: true });
    expect(await gatheringConcept._visibleTo({ ...earlier, user: "dana" })).toEqual({ allowed: false });
    expect(await gatheringConcept._get({ gathering: "missing" })).toEqual([]);
    expect(await gatheringConcept._contextFor({ gathering: "missing" })).toEqual([]);
    expect((await gatheringConcept._listFor({ user: "bob" })).gatherings.map((item) => item.gathering))
      .toEqual([earlier.gathering, later.gathering]);
  });

  test("refuses an organizer-only, stale, duplicate, or unauthorized confirmation without changing commitments", async () => {
    const ref = await propose();
    await expect(confirm(ref, ["alice"])).rejects.toBeInstanceOf(StaleGathering);
    await accept(ref);
    const before = await gatheringConcept._listFor({ user: "alice" });
    for (const roster of [["alice", "carol"], ["alice", "bob", "bob"], ["alice", "alice"]]) {
      await expect(confirm(ref, roster)).rejects.toBeInstanceOf(StaleGathering);
    }
    await expect(confirm({ ...ref, version: "stale" })).rejects.toBeInstanceOf(StaleGathering);
    await expect(gatheringConcept.confirm({ ...ref, user: "bob", expectedAttendees: ["alice", "bob"] }))
      .rejects.toBeInstanceOf(GatheringForbidden);
    expect(await gatheringConcept._listFor({ user: "alice" })).toEqual(before);
    expect(await commitments()).toEqual({ commitments: [] });
  });

  test("a confirmed edit releases the old time and requires responses to the exact new version", async () => {
    const ref = await propose();
    await accept(ref);
    await confirm(ref);
    const edit = { ...details, user: "alice", gathering: ref.gathering, expectedVersion: ref.version };
    await expect(gatheringConcept.edit(edit)).rejects.toBeInstanceOf(InvalidGathering);
    await expect(gatheringConcept.edit({ ...edit, user: "bob", place: "Cafe" })).rejects.toBeInstanceOf(StaleGathering);
    const { version, affectedUsers } = await gatheringConcept.edit({ ...edit, start: at(4), end: at(6) });
    expect(version).not.toBe(ref.version);
    expect(affectedUsers).toEqual(["bob", "carol"]);
    expect(await commitments()).toEqual({ commitments: [] });
    expect((await gatheringConcept._listFor({ user: "bob" })).gatherings).toMatchObject([
      { version, number: 2, status: "PROPOSED", myResponse: "PENDING", accepted: ["alice"], start: at(4) },
    ]);
    await expect(accept(ref)).rejects.toBeInstanceOf(StaleGathering);
    await expect(confirm(ref)).rejects.toBeInstanceOf(StaleGathering);
    const revised = { ...ref, version };
    await expect(confirm(revised)).rejects.toBeInstanceOf(StaleGathering);
    await accept(revised);
    await confirm(revised);
    expect(await commitments(["bob"])).toEqual({ commitments: [{ owner: "bob", start: at(4), end: at(6) }] });
  });

  test("declining and reinviting preserve the confirmed roster until explicit late acceptance", async () => {
    const ref = await propose();
    await expect(accept(ref, "dana")).rejects.toBeInstanceOf(GatheringForbidden);
    await gatheringConcept.decline({ ...ref, user: "carol" });
    expect((await gatheringConcept._listFor({ user: "carol" })).gatherings).toMatchObject([{ myResponse: "DECLINED" }]);
    await expect(gatheringConcept.decline({ ...ref, user: "carol" })).rejects.toBeInstanceOf(GatheringForbidden);
    await accept(ref);
    await confirm(ref);
    await expect(gatheringConcept.invite({ ...ref, user: "bob", invitee: "dana" })).rejects.toBeInstanceOf(GatheringForbidden);
    await expect(gatheringConcept.invite({ ...ref, user: "alice", invitee: "bob" })).rejects.toBeInstanceOf(GatheringForbidden);
    await gatheringConcept.invite({ ...ref, user: "alice", invitee: "carol" });
    await gatheringConcept.invite({ ...ref, user: "alice", invitee: "dana" });
    expect((await gatheringConcept._listFor({ user: "dana" })).gatherings).toMatchObject([
      { myResponse: "PENDING", pending: ["carol", "dana"], attendees: ["alice", "bob"] },
    ]);
    expect(await accept(ref, "dana")).toEqual({ joined: true, affectedUsers: ["alice", "bob"] });
  });

  test("withdrawal preserves pending invitations and closes when only the organizer remains without pending responses", async () => {
    const ref = await propose();
    await expect(gatheringConcept.withdraw({ ...ref, user: "bob" })).rejects.toBeInstanceOf(GatheringForbidden);
    await expect(gatheringConcept.withdraw({ ...ref, user: "alice" })).rejects.toBeInstanceOf(GatheringForbidden);
    await accept(ref);
    await confirm(ref);
    expect(await gatheringConcept.withdraw({ ...ref, user: "bob" })).toEqual({ affectedUsers: ["alice"], status: "CONFIRMED" });
    expect(await commitments(["bob"])).toEqual({ commitments: [] });
    await accept(ref, "carol");
    expect(await gatheringConcept.withdraw({ ...ref, user: "carol" })).toEqual({ affectedUsers: ["alice", "bob"], status: "CANCELLED" });
    expect(await gatheringConcept._get(ref)).toMatchObject([{ status: "CANCELLED", attendees: [] }]);
    expect(await commitments()).toEqual({ commitments: [] });
    await expect(accept(ref)).rejects.toBeInstanceOf(StaleGathering);
  });

  test("only the organizer can cancel, releasing the interval and preserving invitee access", async () => {
    const ref = await propose();
    await accept(ref);
    await confirm(ref);
    await expect(gatheringConcept.cancel({ ...ref, user: "bob" })).rejects.toBeInstanceOf(GatheringForbidden);
    expect(await gatheringConcept.cancel({ ...ref, user: "alice" })).toEqual({ affectedUsers: ["bob", "carol"] });
    expect(await commitments()).toEqual({ commitments: [] });
    expect((await gatheringConcept._listFor({ user: "carol" })).gatherings).toMatchObject([{ status: "CANCELLED" }]);
    await expect(gatheringConcept.cancel({ ...ref, user: "alice" })).rejects.toBeInstanceOf(StaleGathering);
  });

  test("clips commitments to the query range and stops accepting responses exactly at the start", async () => {
    const ref = await propose();
    await accept(ref);
    await confirm(ref);
    const query = { users: ["bob", "carol"], from: at(1), to: at(3.5), now: new Date(at(3)) };
    expect(await gatheringConcept._commitmentsFor(query)).toEqual({
      commitments: [{ owner: "bob", start: at(3), end: at(3.5) }],
    });
    now = new Date(at(2));
    await expect(accept(ref, "carol")).rejects.toBeInstanceOf(StaleGathering);
    await expect(gatheringConcept.decline({ ...ref, user: "carol" })).rejects.toBeInstanceOf(StaleGathering);
    await expect(gatheringConcept.withdraw({ ...ref, user: "bob" })).rejects.toBeInstanceOf(StaleGathering);
    expect(await gatheringConcept._commitmentsFor({ ...query, now: new Date(at(4)) })).toEqual({ commitments: [] });
  });

  test("a racing acceptance cannot be silently included in an outdated confirmation", async () => {
    const ref = await propose();
    await accept(ref);
    const [confirmation, acceptance] = await Promise.allSettled([confirm(ref), accept(ref, "carol")]);
    expect(acceptance.status).toBe("fulfilled");
    if (confirmation.status === "fulfilled") {
      expect(confirmation.value).toEqual({ attendees: ["alice", "bob"] });
      expect(acceptance).toMatchObject({ value: { joined: true } });
    } else {
      expect(confirmation.reason).toBeInstanceOf(StaleGathering);
      expect(acceptance).toMatchObject({ value: { joined: false } });
      expect(await commitments()).toEqual({ commitments: [] });
      expect(await confirm(ref, ["alice", "bob", "carol"])).toEqual({ attendees: ["alice", "bob", "carol"] });
    }
    expect(await gatheringConcept._get(ref)).toMatchObject([
      { status: "CONFIRMED", attendees: ["alice", "bob", "carol"] },
    ]);
  });

  test("competing confirmations commit a shared attendee at most once while adjacent gatherings remain valid", async () => {
    const first = await propose(["bob"]);
    const second = await propose(["bob"], "dana");
    await accept(first);
    await accept(second);
    const attempts = await Promise.allSettled([
      confirm(first),
      gatheringConcept.confirm({ ...second, user: "dana", expectedAttendees: ["dana", "bob"] }),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({
      reason: expect.any(GatheringConflict),
    });
    const loser = attempts[0].status === "rejected" ? first : second;
    expect(await gatheringConcept._get(loser)).toMatchObject([{ status: "PROPOSED", attendees: [] }]);
    expect(await commitments(["bob"])).toEqual({ commitments: [{ owner: "bob", start: at(2), end: at(4) }] });
    await expect(propose(["carol"], "bob")).rejects.toBeInstanceOf(GatheringConflict);
    const adjacent = await propose(["bob"], "erin", { ...details, start: at(4), end: at(6) });
    await accept(adjacent);
    await gatheringConcept.confirm({ ...adjacent, user: "erin", expectedAttendees: ["erin", "bob"] });
    const result = await commitments(["bob"]);
    expect(result.commitments.sort((first, second) => first.start.localeCompare(second.start))).toEqual([
      { owner: "bob", start: at(2), end: at(4) }, { owner: "bob", start: at(4), end: at(6) },
    ]);
  });
});
