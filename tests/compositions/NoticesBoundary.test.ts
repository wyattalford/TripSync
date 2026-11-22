import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../../src/assembly.ts";
import { policy } from "../../src/http.ts";
import { deliverPendingNotices } from "../../src/noticeOutbox.ts";

// System-level inbox tests: real HTTP handler, cookies, compositions, outbox delivery, and MongoDB.

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for notice boundary tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_notices_boundary_test";
const client = new MongoClient(testUrl.toString());
let db: Db;
const origin = "http://127.0.0.1:5173";
const password = "safe password";

type Notice = { notice: string; message: string; destination: string; createdAt: string; readAt: string | null };
type Api = ReturnType<typeof handler>;

async function reset() {
  if (db.databaseName !== "opentime_notices_boundary_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function post(path: string, body: Record<string, unknown> = {}, cookie?: string) {
  return new Request(`${origin}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function handler() {
  const application = assembleApplication(db);
  return createHttpHandler({ application, gateway: createGateway({ application }), policy });
}

async function account(api: Api, username: string) {
  const { user } = (await (await api(post("/auth/register", { username, password }))).json()) as { user: string };
  const signedIn = await api(post("/auth/sign-in", { username, password }));
  return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0]! };
}

async function inbox(api: Api, cookie: string) {
  return ((await (await api(post("/notices/list", {}, cookie))).json()) as { notices: Notice[] }).notices;
}

async function deliver() {
  await deliverPendingNotices(db, assembleApplication(db).concepts.Notifying);
}

/** John owns a group and invites each named account; returns the group id. */
async function groupWithInvites(api: Api, owner: { cookie: string }, name: string, invitees: string[]) {
  const { group } = (await (await api(post("/groups/create", { name }, owner.cookie))).json()) as { group: string };
  for (const username of invitees) expect((await api(post("/groups/invite", { group, username }, owner.cookie))).status).toBe(200);
  return group;
}

describe("OpenTime inbox at the system boundary", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(reset);
  afterAll(async () => { await reset(); await client.close(); });

  test("every inbox endpoint requires a session", async () => {
    const api = handler();
    for (const [path, body] of [["/notices/list", {}], ["/notices/mark-read", { notice: crypto.randomUUID() }], ["/notices/mark-all-read", {}]] as const) {
      const response = await api(post(path, body));
      expect({ path, status: response.status }).toEqual({ path, status: 401 });
    }
  });

  test("a new account starts with an empty inbox", async () => {
    const api = handler();
    const john = await account(api, "john");
    expect(await inbox(api, john.cookie)).toEqual([]);
  });

  test("a group invitation reaches only the invitee, with a link to that group", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    const eli = await account(api, "eli");
    const group = await groupWithInvites(api, john, "Movie crew", ["walker"]);
    expect(await inbox(api, walker.cookie)).toEqual([]);
    await deliver();
    expect(await inbox(api, walker.cookie)).toEqual([expect.objectContaining({
      message: "You have been invited to Movie crew", destination: `/groups/${group}`, readAt: null,
    })]);
    expect(await inbox(api, john.cookie)).toEqual([]);
    expect(await inbox(api, eli.cookie)).toEqual([]);
  });

  test("a user cannot mark another user's notice read, and a made-up notice is refused", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    await groupWithInvites(api, john, "Movie crew", ["walker"]);
    await deliver();
    const [invite] = await inbox(api, walker.cookie);
    expect((await api(post("/notices/mark-read", { notice: invite!.notice }, john.cookie))).status).toBe(403);
    expect((await api(post("/notices/mark-read", { notice: crypto.randomUUID() }, walker.cookie))).status).toBe(403);
    expect((await inbox(api, walker.cookie))[0]!.readAt).toBeNull();
    const marked = await api(post("/notices/mark-read", { notice: invite!.notice }, walker.cookie));
    expect(marked.status).toBe(200);
    expect(await marked.json()).toEqual({ markedRead: true });
    expect((await inbox(api, walker.cookie))[0]!.readAt).not.toBeNull();
  });

  test("mark all read clears only the requester's unread notices", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    const eli = await account(api, "eli");
    await groupWithInvites(api, john, "Movie crew", ["walker", "eli"]);
    await groupWithInvites(api, john, "Study group", ["walker"]);
    await deliver();
    expect((await inbox(api, walker.cookie)).filter((item) => !item.readAt)).toHaveLength(2);
    const response = await api(post("/notices/mark-all-read", {}, walker.cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ markedRead: true });
    expect((await inbox(api, walker.cookie)).every((item) => item.readAt)).toBe(true);
    expect((await inbox(api, eli.cookie))[0]!.readAt).toBeNull();
    expect((await api(post("/notices/mark-all-read", {}, walker.cookie))).status).toBe(200);
  });

  test("reading a notice does not accept the invitation it describes", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    const group = await groupWithInvites(api, john, "Movie crew", ["walker"]);
    await deliver();
    await api(post("/notices/mark-all-read", {}, walker.cookie));
    const visible = ((await (await api(post("/groups/list", {}, walker.cookie))).json()) as { groups: { group: string; membership: string }[] }).groups;
    expect(visible.find((item) => item.group === group)?.membership).toBe("PENDING");
  });

  test("the inbox lists the newest notice first", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    await groupWithInvites(api, john, "First group", ["walker"]);
    await deliver();
    await groupWithInvites(api, john, "Second group", ["walker"]);
    await deliver();
    expect((await inbox(api, walker.cookie)).map((item) => item.message)).toEqual([
      "You have been invited to Second group", "You have been invited to First group",
    ]);
  });

  test("re-inviting after a decline produces a new notice; repeated delivery does not duplicate", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    const group = await groupWithInvites(api, john, "Movie crew", ["walker"]);
    await deliver();
    await deliver();
    expect(await inbox(api, walker.cookie)).toHaveLength(1);
    await api(post("/groups/decline", { group }, walker.cookie));
    expect((await api(post("/groups/invite", { group, username: "walker" }, john.cookie))).status).toBe(200);
    await deliver();
    expect(await inbox(api, walker.cookie)).toHaveLength(2);
  });

  test("a gathering proposal notifies each invitee but not the organizer", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    const eli = await account(api, "eli");
    const group = await groupWithInvites(api, john, "Movie crew", ["walker", "eli"]);
    for (const member of [walker, eli]) await api(post("/groups/accept", { group }, member.cookie));
    const start = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const end = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const proposed = await api(post("/gatherings/propose", {
      group, invitees: [walker.user, eli.user], purpose: "movie", activity: "Film night", place: "Lounge", start, end,
    }, john.cookie));
    expect(proposed.status).toBe(200);
    const { gathering } = (await proposed.json()) as { gathering: string };
    await deliver();
    for (const member of [walker, eli]) {
      expect(await inbox(api, member.cookie)).toContainEqual(expect.objectContaining({
        message: "You have been invited to Film night", destination: `/gatherings/${gathering}`,
      }));
    }
    expect((await inbox(api, john.cookie)).some((item) => item.destination === `/gatherings/${gathering}`)).toBe(false);
  });

  test("the inbox never exposes recipients or source keys", async () => {
    const api = handler();
    const john = await account(api, "john");
    const walker = await account(api, "walker");
    await groupWithInvites(api, john, "Movie crew", ["walker"]);
    await deliver();
    const [item] = await inbox(api, walker.cookie);
    expect(Object.keys(item!).sort()).toEqual(["createdAt", "destination", "message", "notice", "readAt"]);
    expect(JSON.stringify(item)).not.toContain(walker.user);
  });
});
