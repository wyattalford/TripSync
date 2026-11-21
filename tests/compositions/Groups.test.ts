import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../../src/assembly.ts";
import { policy } from "../../src/http.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for group tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_groups_test";
const client = new MongoClient(testUrl.toString());
let db: Db;

async function resetTestDatabase() {
  if (db.databaseName !== "opentime_groups_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function post(path: string, body: Record<string, unknown> = {}, cookie?: string) {
  return new Request(`http://127.0.0.1:5173/api${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:5173",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function handler() {
  const application = assembleApplication(db);
  return createHttpHandler({ application, gateway: createGateway({ application }), policy });
}

describe("OpenTime group boundary", () => {
  beforeAll(async () => {
    await client.connect();
    db = client.db();
  });
  beforeEach(resetTestDatabase);
  afterAll(async () => {
    await resetTestDatabase();
    await client.close();
  });

  test("named invitations require acceptance and remain private until membership", async () => {
    const api = handler();
    async function account(username: string) {
      expect((await api(post("/auth/register", { username, password: "safe password" }))).status).toBe(200);
      const signIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      expect(signIn.status).toBe(200);
      return signIn.headers.get("set-cookie")!.split(";", 1)[0];
    }
    const john = await account("john");
    const walker = await account("walker");
    const noah = await account("noah");
    const created = await api(post("/groups/create", { name: "Movie night" }, john));
    expect(created.status).toBe(200);
    const { group } = await created.json() as { group: string };
    const before = await api(post("/groups/list", {}, walker));
    expect(await before.json()).toEqual({ groups: [] });
    expect((await api(post("/groups/invite", { group, username: "walker" }, noah))).status).toBe(403);
    const missingInvitee = await api(post("/groups/invite", { group, username: "missing" }, john));
    expect(missingInvitee.status).toBe(404);
    expect((await api(post("/groups/invite", { group, username: "walker" }, john))).status).toBe(200);
    const pending = await api(post("/groups/list", {}, walker));
    expect((await pending.json() as { groups: { membership: string }[] }).groups[0]?.membership).toBe("PENDING");
    expect((await api(post("/groups/accept", { group }, walker))).status).toBe(200);
    const visible = await api(post("/groups/list", {}, john));
    expect((await visible.json() as { groups: { memberCount: number }[] }).groups[0]?.memberCount).toBe(2);
    expect((await api(post("/groups/accept", { group }, walker))).status).toBe(409);
    expect((await api(post("/groups/create", { name: "No session" }))).status).toBe(401);
    expect((await api(post("/groups/invite", { group, username: { $ne: null } }, john))).status).toBe(400);
  });

  test("link joining is explicit; removal blocks reuse, reinvitation and closure update access", async () => {
    const api = handler();
    async function account(username: string) {
      await api(post("/auth/register", { username, password: "safe password" }));
      const signIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return signIn.headers.get("set-cookie")!.split(";", 1)[0];
    }
    const john = await account("john");
    const eli = await account("eli");
    const created = await api(post("/groups/create", { name: "Study crew" }, john));
    const { group } = await created.json() as { group: string };
    expect(await (await api(post("/groups/link", { group }, eli))).json()).toEqual({ error: "FORBIDDEN" });
    const link = await api(post("/groups/link", { group }, john));
    expect(link.status).toBe(200);
    const { url } = await link.json() as { url: string };
    expect(url).toMatch(/^\/join\/[0-9a-f-]{36}$/);
    expect(await (await api(post("/groups/list", {}, eli))).json()).toEqual({ groups: [] });
    expect((await api(post("/groups/join", { url }, eli))).status).toBe(200);
    expect((await api(post("/groups/join", { url }, eli))).status).toBe(409);
    expect((await api(post("/groups/remove", { group, username: "eli" }, john))).status).toBe(200);
    expect(await (await api(post("/groups/list", {}, eli))).json()).toEqual({ groups: [] });
    expect((await api(post("/groups/join", { url }, eli))).status).toBe(403);
    expect((await api(post("/groups/invite", { group, username: "eli" }, john))).status).toBe(200);
    expect((await api(post("/groups/decline", { group }, eli))).status).toBe(200);
    expect((await api(post("/groups/invite", { group, username: "eli" }, john))).status).toBe(200);
    expect((await api(post("/groups/accept", { group }, eli))).status).toBe(200);
    expect((await api(post("/groups/leave", { group }, eli))).status).toBe(200);
    expect(await (await api(post("/groups/list", {}, eli))).json()).toEqual({ groups: [] });
    expect((await api(post("/groups/join", { url }, eli))).status).toBe(200);
    expect((await api(post("/groups/close", { group }, eli))).status).toBe(403);
    expect((await api(post("/groups/close", { group }, john))).status).toBe(200);
    expect(await (await api(post("/groups/list", {}, eli))).json()).toEqual({ groups: [] });
    expect((await api(post("/groups/join", { url }, eli))).status).toBe(409);
  });
});
