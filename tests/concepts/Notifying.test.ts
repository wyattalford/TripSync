import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { InvalidNotice, NoticeForbidden, NotifyingConcept, isNoticeDestination } from "../../src/concepts/Notifying.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for Notifying tests.");
const databaseName = `opentime_notifying_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const client = new MongoClient(testUrl.toString());
let db: Db;
let now: Date;
let notifying: NotifyingConcept;

const baseTime = Date.parse("2030-01-01T12:00:00.000Z");
const group = `/groups/${crypto.randomUUID()}`;
const gathering = `/gatherings/${crypto.randomUUID()}`;

async function resetTestDatabase() {
  if (db.databaseName !== databaseName || !databaseName.startsWith("opentime_notifying_")) {
    throw new Error("Refusing to reset another database.");
  }
  await db.dropDatabase();
}

async function storedNotices() {
  return db.collection("notifying.notices").find().sort({ _id: 1 }).toArray();
}

async function expectUnchanged(action: () => Promise<unknown>, error: new (message?: string) => Error) {
  const before = await storedNotices();
  await expect(action()).rejects.toBeInstanceOf(error);
  expect(await storedNotices()).toEqual(before);
}

function advance(minutes: number) {
  now = new Date(now.getTime() + minutes * 60_000);
}

function notice(recipient: string, sourceKey: string, message = "You have been invited to Movie crew", destination = group) {
  return notifying.notify({ recipient, sourceKey, message, destination });
}

describe("Notifying", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => {
    await resetTestDatabase();
    now = new Date(baseTime);
    notifying = new NotifyingConcept(db, () => now);
  });
  afterAll(async () => { await resetTestDatabase(); await client.close(); });

  test("principle: a notice stays unread until its recipient marks it read", async () => {
    const { notice: id } = await notice("walker", "invite-1");
    expect(await notifying._inbox({ user: "walker" })).toEqual({
      notices: [{ notice: id, message: "You have been invited to Movie crew", destination: group, createdAt: new Date(baseTime).toISOString(), readAt: null }],
    });
    advance(5);
    expect(await notifying.markRead({ user: "walker", notice: id })).toEqual({});
    expect((await notifying._inbox({ user: "walker" })).notices[0]!.readAt).toBe(new Date(baseTime + 5 * 60_000).toISOString());
  });

  test("accepts group and gathering destinations", async () => {
    await notice("walker", "a", "Group notice", group);
    await notice("walker", "b", "Gathering notice", gathering);
    expect((await notifying._inbox({ user: "walker" })).notices.map((item) => item.destination).sort()).toEqual([gathering, group].sort());
  });

  test("refuses blank source keys or messages and any destination that is not one group or gathering", async () => {
    await notice("walker", "existing");
    const id = crypto.randomUUID();
    const invalid: [string, string, string][] = [
      ["", "Message", group], ["   ", "Message", group],
      ["key", "", group], ["key", "  ", group],
      ["key", "Message", ""], ["key", "Message", "/groups/"], ["key", "Message", "/gatherings/"],
      ["key", "Message", "/groups/not-an-id"], ["key", "Message", `/groups/${id}/`], ["key", "Message", `/groups/${id}/extra`],
      ["key", "Message", `/groups/../${id}`], ["key", "Message", `groups/${id}`], ["key", "Message", `/openings/${id}`],
      ["key", "Message", `https://evil.example/groups/${id}`], ["key", "Message", `//evil.example/groups/${id}`],
      ["key", "Message", `/groups/${id.toUpperCase()}`], ["key", "Message", `/groups/${id}?x=1`],
    ];
    for (const [sourceKey, message, destination] of invalid) {
      await expectUnchanged(() => notifying.notify({ recipient: "walker", sourceKey, message, destination }), InvalidNotice);
    }
  });

  test("isNoticeDestination matches the concept's destination rule", () => {
    expect(isNoticeDestination(group)).toBe(true);
    expect(isNoticeDestination(gathering)).toBe(true);
    expect(isNoticeDestination("/groups/")).toBe(false);
    expect(isNoticeDestination(`${group}/`)).toBe(false);
  });

  test("repeating a delivery with the same recipient and source key returns the original notice unchanged", async () => {
    const first = await notice("walker", "invite-1", "Original");
    advance(10);
    const again = await notice("walker", "invite-1", "Changed wording", gathering);
    expect(again.notice).toBe(first.notice);
    expect(await notifying._inbox({ user: "walker" })).toEqual({
      notices: [{ notice: first.notice, message: "Original", destination: group, createdAt: new Date(baseTime).toISOString(), readAt: null }],
    });
  });

  test("repeating a delivery does not mark a read notice unread", async () => {
    const { notice: id } = await notice("walker", "invite-1");
    await notifying.markRead({ user: "walker", notice: id });
    await notice("walker", "invite-1");
    expect((await notifying._inbox({ user: "walker" })).notices[0]!.readAt).not.toBeNull();
  });

  test("one source key delivers a separate notice to each recipient", async () => {
    const ids = await Promise.all(["walker", "eli", "noah"].map((recipient) => notice(recipient, "proposal-1")));
    expect(new Set(ids.map((item) => item.notice)).size).toBe(3);
    for (const recipient of ["walker", "eli", "noah"]) expect((await notifying._inbox({ user: recipient })).notices).toHaveLength(1);
  });

  test("concurrent duplicate deliveries create exactly one notice", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => notice("walker", "invite-1")));
    expect(new Set(results.map((item) => item.notice)).size).toBe(1);
    expect(await db.collection("notifying.notices").countDocuments()).toBe(1);
  });

  test("the inbox lists only the user's notices, newest first", async () => {
    const first = await notice("walker", "a", "First");
    advance(1);
    await notice("eli", "b", "For Eli");
    advance(1);
    const third = await notice("walker", "c", "Third");
    expect((await notifying._inbox({ user: "walker" })).notices.map((item) => item.notice)).toEqual([third.notice, first.notice]);
    expect((await notifying._inbox({ user: "eli" })).notices.map((item) => item.message)).toEqual(["For Eli"]);
    expect(await notifying._inbox({ user: "nobody" })).toEqual({ notices: [] });
  });

  test("markRead refuses another user's notice and an unknown notice without changing state", async () => {
    const { notice: id } = await notice("walker", "invite-1");
    await expectUnchanged(() => notifying.markRead({ user: "eli", notice: id }), NoticeForbidden);
    await expectUnchanged(() => notifying.markRead({ user: "walker", notice: crypto.randomUUID() }), NoticeForbidden);
    await expectUnchanged(() => notifying.markRead({ user: "walker", notice: "" }), NoticeForbidden);
  });

  test("markRead is idempotent and keeps the first read time", async () => {
    const { notice: id } = await notice("walker", "invite-1");
    await notifying.markRead({ user: "walker", notice: id });
    const firstRead = (await notifying._inbox({ user: "walker" })).notices[0]!.readAt;
    advance(30);
    expect(await notifying.markRead({ user: "walker", notice: id })).toEqual({});
    expect((await notifying._inbox({ user: "walker" })).notices[0]!.readAt).toBe(firstRead);
  });

  test("markAllRead marks only the user's unread notices and keeps earlier read times", async () => {
    const early = await notice("walker", "a");
    await notifying.markRead({ user: "walker", notice: early.notice });
    advance(1);
    await notice("walker", "b");
    await notice("walker", "c");
    await notice("eli", "d");
    advance(1);
    expect(await notifying.markAllRead({ user: "walker" })).toEqual({});
    const walker = (await notifying._inbox({ user: "walker" })).notices;
    expect(walker.every((item) => item.readAt !== null)).toBe(true);
    expect(walker.find((item) => item.notice === early.notice)!.readAt).toBe(new Date(baseTime).toISOString());
    expect(walker.filter((item) => item.notice !== early.notice).map((item) => item.readAt))
      .toEqual([new Date(baseTime + 2 * 60_000).toISOString(), new Date(baseTime + 2 * 60_000).toISOString()]);
    expect((await notifying._inbox({ user: "eli" })).notices[0]!.readAt).toBeNull();
  });

  test("markAllRead succeeds for an empty inbox and when nothing is unread", async () => {
    expect(await notifying.markAllRead({ user: "nobody" })).toEqual({});
    const { notice: id } = await notice("walker", "a");
    await notifying.markRead({ user: "walker", notice: id });
    const before = await storedNotices();
    expect(await notifying.markAllRead({ user: "walker" })).toEqual({});
    expect(await storedNotices()).toEqual(before);
  });

  test("notices delivered after markAllRead are unread", async () => {
    await notice("walker", "a");
    await notifying.markAllRead({ user: "walker" });
    advance(1);
    await notice("walker", "b", "Later");
    const inbox = (await notifying._inbox({ user: "walker" })).notices;
    expect(inbox[0]).toMatchObject({ message: "Later", readAt: null });
    expect(inbox[1]!.readAt).not.toBeNull();
  });
});
