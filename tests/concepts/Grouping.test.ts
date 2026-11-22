import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { GroupForbidden, GroupingConcept, InvalidGroup, MembershipConflict } from "../../src/concepts/Grouping.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for Grouping tests.");
const url = new URL(configuredUrl);
const databaseName = `opentime_grouping_${crypto.randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${databaseName}`;
const client = new MongoClient(url.toString());
let db: Db;
let grouping: GroupingConcept;

async function reset() {
  if (db.databaseName !== databaseName) throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

const create = (name = "Friends") => grouping.create({ owner: "alice", name });
const invite = (group: string, invitee = "bob") => grouping.invite({ user: "alice", group, invitee });

describe("Grouping", () => {
  beforeAll(async () => { await client.connect(); db = client.db(databaseName); });
  beforeEach(async () => { await reset(); grouping = new GroupingConcept(db); });
  afterAll(async () => { await reset(); await client.close(); });

  test("principle: a named invitation grants access only after acceptance and leaving revokes it", async () => {
    const { group } = await create("  Friends  ");
    expect(await grouping._getGroup({ group })).toEqual([
      { owner: "alice", name: "Friends", status: "ACTIVE", members: ["alice"] },
    ]);
    await invite(group);
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "PENDING" }]);
    expect(await grouping._visibleFor({ user: "bob" })).toEqual({
      groups: [{ group, name: "Friends", owner: "alice", membership: "PENDING", memberCount: 1 }],
    });
    expect(await grouping._groupsFor({ user: "bob" })).toEqual([]);
    expect(await grouping._accessFor({ user: "bob", group })).toEqual({ allowed: false, members: [] });
    await grouping.accept({ user: "bob", group });
    expect(await grouping._groupsFor({ user: "bob" })).toEqual([{ group }]);
    expect(await grouping._accessFor({ user: "bob", group })).toEqual({ allowed: true, members: ["alice", "bob"] });
    await grouping.leave({ user: "bob", group });
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "LEFT" }]);
    expect(await grouping._visibleFor({ user: "bob" })).toEqual({ groups: [] });
    expect(await grouping._accessFor({ user: "bob", group })).toEqual({ allowed: false, members: [] });
  });

  test("decline hides an invitation until the owner sends a fresh named invitation", async () => {
    const { group } = await create();
    await invite(group);
    await grouping.decline({ user: "bob", group });
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "DECLINED" }]);
    expect(await grouping._visibleFor({ user: "bob" })).toEqual({ groups: [] });
    await expect(grouping.accept({ user: "bob", group })).rejects.toBeInstanceOf(MembershipConflict);
    await expect(grouping.decline({ user: "bob", group })).rejects.toBeInstanceOf(MembershipConflict);
    await invite(group);
    await grouping.accept({ user: "bob", group });
    await expect(invite(group)).rejects.toBeInstanceOf(MembershipConflict);
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "MEMBER" }]);
  });

  test("explicit link joins work for outsiders and former members, but removal blocks link reuse", async () => {
    const { group } = await create();
    const [{ url: joinUrl }] = await grouping._joinUrl({ group });
    expect(joinUrl).toMatch(/^\/join\/[0-9a-f-]{36}$/);
    expect(await grouping._membership({ user: "bob", group })).toEqual([]);
    expect(await grouping.join({ user: "bob", url: joinUrl })).toEqual({ group });
    await expect(grouping.join({ user: "bob", url: joinUrl })).rejects.toBeInstanceOf(MembershipConflict);
    await grouping.leave({ user: "bob", group });
    await grouping.join({ user: "bob", url: joinUrl });
    await grouping.remove({ user: "alice", group, member: "bob" });
    await expect(grouping.join({ user: "bob", url: joinUrl })).rejects.toBeInstanceOf(GroupForbidden);
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "REMOVED" }]);
    await invite(group);
    await grouping.accept({ user: "bob", group });
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "MEMBER" }]);
  });

  test("owner-only operations and invalid responses preserve the roster", async () => {
    await expect(create("   ")).rejects.toBeInstanceOf(InvalidGroup);
    const { group } = await create();
    const { group: other } = await create();
    expect(other).not.toBe(group);
    expect(await grouping._joinUrl({ group: other })).not.toEqual(await grouping._joinUrl({ group }));
    expect(await grouping._getGroup({ group: "missing" })).toEqual([]);
    expect(await grouping._joinUrl({ group: "missing" })).toEqual([]);
    await invite(group);
    const before = await grouping._getGroup({ group });
    for (const action of [
      () => grouping.invite({ user: "bob", group, invitee: "carol" }),
      () => invite(group, "alice"),
      () => grouping.leave({ user: "alice", group }),
      () => grouping.remove({ user: "bob", group, member: "alice" }),
      () => grouping.remove({ user: "alice", group, member: "alice" }),
      () => grouping.close({ user: "bob", group }),
    ]) {
      await expect(action()).rejects.toBeInstanceOf(GroupForbidden);
    }
    await expect(grouping.accept({ user: "carol", group })).rejects.toBeInstanceOf(MembershipConflict);
    expect(await grouping._getGroup({ group })).toEqual(before);
    expect(await grouping._membership({ user: "bob", group })).toEqual([{ status: "PENDING" }]);
  });

  test("removing a pending invitation and closing a group revoke access and planning eligibility", async () => {
    const { group } = await create();
    const [{ url: joinUrl }] = await grouping._joinUrl({ group });
    await invite(group);
    await invite(group, "carol");
    await grouping.accept({ user: "bob", group });
    expect(await grouping._canShareWith({ user: "bob", groups: [group, group] })).toEqual({ allowed: true });
    expect(await grouping._canShareWith({ user: "bob", groups: [group, "missing"] })).toEqual({ allowed: false });
    expect(await grouping._canShareWith({ user: "bob", groups: [] })).toEqual({ allowed: true });
    expect(await grouping._canPlanWith({ user: "alice", group, invitees: ["bob"] })).toEqual({ allowed: true });
    for (const invitees of [[], ["alice"], ["bob", "bob"], ["bob", "carol"]]) {
      expect(await grouping._canPlanWith({ user: "alice", group, invitees })).toEqual({ allowed: false });
    }
    expect(await grouping._canInviteToGathering({ user: "alice", group, invitee: "bob" })).toEqual({ allowed: true });
    expect(await grouping._canInviteToGathering({ user: "alice", group, invitee: "carol" })).toEqual({ allowed: false });
    await grouping.remove({ user: "alice", group, member: "carol" });
    await expect(grouping.accept({ user: "carol", group })).rejects.toBeInstanceOf(MembershipConflict);
    expect(await grouping._membership({ user: "carol", group })).toEqual([{ status: "REMOVED" }]);
    await grouping.close({ user: "alice", group });
    expect(await grouping._getGroup({ group })).toMatchObject([{ status: "CLOSED" }]);
    expect(await grouping._accessFor({ user: "alice", group })).toEqual({ allowed: false, members: [] });
    expect(await grouping._groupsFor({ user: "bob" })).toEqual([]);
    expect(await grouping._canShareWith({ user: "bob", groups: [group] })).toEqual({ allowed: false });
    expect(await grouping._canPlanWith({ user: "alice", group, invitees: ["bob"] })).toEqual({ allowed: false });
    await expect(grouping.join({ user: "dana", url: joinUrl })).rejects.toBeInstanceOf(MembershipConflict);
    await expect(invite(group, "dana")).rejects.toBeInstanceOf(GroupForbidden);
  });

  test("concurrent responses can consume a pending invitation only once", async () => {
    const { group } = await create();
    await invite(group);
    const response = { user: "bob", group };
    const attempts = await Promise.allSettled([grouping.accept(response), grouping.decline(response)]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({
      reason: expect.any(MembershipConflict),
    });
    const accepted = attempts[0].status === "fulfilled";
    expect(await grouping._membership(response)).toEqual([{ status: accepted ? "MEMBER" : "DECLINED" }]);
    expect((await grouping._accessFor(response)).allowed).toBe(accepted);
  });
});
