import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../../src/assembly.ts";
import { GatheringConcept } from "../../src/concepts/Gathering.ts";
import { GroupingConcept } from "../../src/concepts/Grouping.ts";
import { NotifyingConcept } from "../../src/concepts/Notifying.ts";
import { policy } from "../../src/http.ts";
import { deliverPendingNotices } from "../../src/noticeOutbox.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for notice tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_notices_test";
const client = new MongoClient(testUrl.toString());
let db: Db;
function at(hours: number) { return new Date(Date.now() + hours * 3_600_000).toISOString(); }
async function reset() {
  if (db.databaseName !== "opentime_notices_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}
function post(path: string, body: Record<string, unknown> = {}, cookie?: string) {
  return new Request(`http://127.0.0.1:5173/api${path}`, { method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body) });
}
function handler() {
  const application = assembleApplication(db);
  return createHttpHandler({ application, gateway: createGateway({ application }), policy });
}

describe("OpenTime in-app notices", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(reset);
  afterAll(async () => { await reset(); await client.close(); });

  test("delivers group and Gathering changes only to recipients and protects read state", async () => {
    const api = handler();
    async function account(username: string) {
      const { user } = await (await api(post("/auth/register", { username, password: "safe password" }))).json() as { user: string };
      const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0] };
    }
    const john = await account("john"), walker = await account("walker"), eli = await account("eli"), noah = await account("noah");
    const group = (await (await api(post("/groups/create", { name: "Movie crew" }, john.cookie))).json() as { group: string }).group;
    for (const [name, member] of [["walker", walker], ["eli", eli], ["noah", noah]] as const) {
      expect((await api(post("/groups/invite", { group, username: name }, john.cookie))).status).toBe(200);
      await api(post("/groups/accept", { group }, member.cookie));
    }
    await deliverPendingNotices(db, assembleApplication(db).concepts.Notifying);
    expect((await (await api(post("/notices/list", {}, john.cookie))).json() as { notices: unknown[] }).notices).toHaveLength(0);
    const firstInbox = await (await api(post("/notices/list", {}, walker.cookie))).json() as { notices: { notice: string; message: string; destination: string; readAt: string | null }[] };
    expect(firstInbox.notices).toHaveLength(1);
    expect(firstInbox.notices[0]).toMatchObject({ message: "You have been invited to Movie crew", destination: `/groups/${group}`, readAt: null });
    expect((await api(post("/notices/mark-read", { notice: firstInbox.notices[0]!.notice }, eli.cookie))).status).toBe(403);
    expect((await api(post("/notices/mark-read", { notice: firstInbox.notices[0]!.notice }, walker.cookie))).status).toBe(200);
    const readAt = (await (await api(post("/notices/list", {}, walker.cookie))).json() as { notices: { readAt: string | null }[] }).notices[0]?.readAt;
    expect(readAt).not.toBeNull();
    await api(post("/notices/mark-read", { notice: firstInbox.notices[0]!.notice }, walker.cookie));
    expect((await (await api(post("/notices/list", {}, walker.cookie))).json() as { notices: { readAt: string | null }[] }).notices[0]?.readAt).toBe(readAt);

    const start = at(3), end = at(4);
    const { gathering, version } = await (await api(post("/gatherings/propose", { group, invitees: [walker.user, eli.user, noah.user], purpose: "movie", activity: "Film", place: "Lounge", start, end }, john.cookie))).json() as { gathering: string; version: string };
    await api(post("/gatherings/accept", { gathering, version }, walker.cookie));
    await api(post("/gatherings/accept", { gathering, version }, eli.cookie));
    await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user, walker.user, eli.user] }, john.cookie));
    const revised = await api(post("/gatherings/edit", { gathering, expectedVersion: version, purpose: "movie", activity: "Second film", place: "Lounge", start, end }, john.cookie));
    const { version: nextVersion } = await revised.json() as { version: string };
    await api(post("/gatherings/accept", { gathering, version: nextVersion }, walker.cookie));
    await api(post("/gatherings/decline", { gathering, version: nextVersion }, eli.cookie));
    await api(post("/gatherings/confirm", { gathering, version: nextVersion, expectedAttendees: [john.user, walker.user] }, john.cookie));
    await api(post("/gatherings/accept", { gathering, version: nextVersion }, noah.cookie));
    await deliverPendingNotices(db);
    const johnMessages = (await (await api(post("/notices/list", {}, john.cookie))).json() as { notices: { message: string }[] }).notices.map((item) => item.message);
    expect(johnMessages).toContain("An invitee accepted your proposal");
    expect(johnMessages).toContain("An invitee declined the gathering");
    expect(johnMessages).toContain("A participant joined the confirmed gathering");
    const noahMessages = (await (await api(post("/notices/list", {}, noah.cookie))).json() as { notices: { message: string }[] }).notices.map((item) => item.message);
    expect(noahMessages).toContain("The gathering changed; review and respond to the new version");
    expect(noahMessages).not.toContain("Your gathering has been confirmed");
    const walkerMessages = (await (await api(post("/notices/list", {}, walker.cookie))).json() as { notices: { message: string }[] }).notices.map((item) => item.message);
    expect(walkerMessages).toContain("Your gathering has been confirmed");
    expect(walkerMessages).toContain("A participant joined the confirmed gathering");
    expect(await db.collection("grouping.groups").countDocuments({ "pendingNotices.0": { $exists: true } })).toBe(0);
    expect(await db.collection("gathering.gatherings").countDocuments({ "pendingNotices.0": { $exists: true } })).toBe(0);
    await deliverPendingNotices(db);
    expect((await (await api(post("/notices/list", {}, walker.cookie))).json() as { notices: unknown[] }).notices).toHaveLength(walkerMessages.length);
  });

  test("retries a failed delivery without duplicate notices and covers invite, withdrawal, and cancellation", async () => {
    const notifying = new NotifyingConcept(db);
    const group = new GroupingConcept(db);
    const gatherings = new GatheringConcept(db);
    const created = await group.create({ owner: "john", name: "Friends" });
    await group.invite({ user: "john", group: created.group, invitee: "walker" });
    const event = (await db.collection<{ _id: string; pendingNotices: { _id: string; destination: string }[] }>("grouping.groups").findOne({ _id: created.group }))?.pendingNotices[0];
    expect(event).toBeTruthy();
    await db.collection<{ _id: string }>("grouping.groups").updateOne({ _id: created.group }, { $set: { "pendingNotices.0.destination": "invalid" } });
    await deliverPendingNotices(db);
    expect((await notifying._inbox({ user: "walker" })).notices).toHaveLength(0);
    expect(await db.collection("grouping.groups").countDocuments({ "pendingNotices.0": { $exists: true } })).toBe(1);
    await db.collection<{ _id: string }>("grouping.groups").updateOne({ _id: created.group }, { $set: { "pendingNotices.0.destination": `/groups/${created.group}` } });
    await deliverPendingNotices(db);
    expect((await notifying._inbox({ user: "walker" })).notices).toHaveLength(1);
    expect((await notifying.notify({ recipient: "walker", sourceKey: event!._id, message: "changed", destination: `/groups/${created.group}` })).notice)
      .toBe((await notifying._inbox({ user: "walker" })).notices[0]?.notice);
    expect((await notifying._inbox({ user: "walker" })).notices[0]?.message).toBe("You have been invited to Friends");

    const start = at(3), end = at(4);
    const plan = await gatherings.propose({ organizer: "john", context: created.group, invitees: ["walker", "eli"], purpose: "movie", activity: "Film", place: "Lounge", start, end });
    await gatherings.invite({ user: "john", ...plan, invitee: "noah" });
    await gatherings.accept({ user: "walker", ...plan });
    await gatherings.confirm({ user: "john", ...plan, expectedAttendees: ["john", "walker"] });
    await gatherings.withdraw({ user: "walker", ...plan });
    await gatherings.cancel({ user: "john", ...plan });
    const closing = await gatherings.propose({ organizer: "john", context: created.group, invitees: ["walker"], purpose: "dinner", activity: "Pizza", place: "Kitchen", start: at(5), end: at(6) });
    await gatherings.accept({ user: "walker", ...closing });
    await gatherings.confirm({ user: "john", ...closing, expectedAttendees: ["john", "walker"] });
    await gatherings.withdraw({ user: "walker", ...closing });
    await deliverPendingNotices(db);
    const john = (await notifying._inbox({ user: "john" })).notices.map((item) => item.message);
    const walker = (await notifying._inbox({ user: "walker" })).notices.map((item) => item.message);
    const noah = (await notifying._inbox({ user: "noah" })).notices.map((item) => item.message);
    expect(john).toContain("A participant has withdrawn from the gathering");
    expect(john).toContain("The gathering closed because only the organizer remained and no invitations were pending");
    expect(walker).toContain("The gathering has been cancelled");
    expect(noah).toContain("You have been invited to a gathering");
    expect(noah).toContain("The gathering has been cancelled");
  });
});
