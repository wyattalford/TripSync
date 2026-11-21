import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../../src/assembly.ts";
import { policy } from "../../src/http.ts";

// System-level authentication tests: every request travels through the real HTTP
// handler, cookie policy, Sync Engine compositions, and MongoDB.

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for account boundary tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_accounts_boundary_test";
const client = new MongoClient(testUrl.toString());
let db: Db;
const origin = "http://127.0.0.1:5173";
const password = "safe password";

async function reset() {
  if (db.databaseName !== "opentime_accounts_boundary_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function post(path: string, body: Record<string, unknown> = {}, cookie?: string, requestOrigin = origin) {
  return new Request(`${origin}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: requestOrigin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function handler() {
  const application = assembleApplication(db);
  return createHttpHandler({ application, gateway: createGateway({ application }), policy });
}

function cookieFrom(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
}

async function account(api: ReturnType<typeof handler>, username: string) {
  const registered = await api(post("/auth/register", { username, password }));
  const { user } = (await registered.json()) as { user: string };
  const signedIn = await api(post("/auth/sign-in", { username, password }));
  return { user, cookie: cookieFrom(signedIn) };
}

const someId = "00000000-0000-4000-8000-000000000000";
const later = new Date(Date.now() + 86_400_000).toISOString();
const muchLater = new Date(Date.now() + 90_000_000).toISOString();

// Every endpoint other than register and sign-in requires an authenticated session.
const protectedRequests: [string, Record<string, unknown>][] = [
  ["/auth/current", {}],
  ["/auth/sign-out", {}],
  ["/groups/create", { name: "Movie crew" }],
  ["/groups/invite", { group: someId, username: "eli" }],
  ["/groups/accept", { group: someId }],
  ["/groups/decline", { group: someId }],
  ["/groups/join", { url: `/join/${someId}` }],
  ["/groups/list", {}],
  ["/groups/members", { group: someId }],
  ["/groups/link", { group: someId }],
  ["/groups/leave", { group: someId }],
  ["/groups/remove", { group: someId, username: "eli" }],
  ["/groups/close", { group: someId }],
  ["/openings/create", { start: later, end: muchLater }],
  ["/openings/publish", { opening: someId, audiences: [] }],
  ["/openings/revise", { opening: someId, start: later, end: muchLater, audiences: [] }],
  ["/openings/withdraw", { opening: someId }],
  ["/openings/mine", {}],
  ["/openings/overlap", { group: someId, from: later, to: muchLater, duration: 60 }],
  ["/gatherings/propose", { group: someId, invitees: [someId], purpose: "Fun", activity: "Movie", place: "Kendall", start: later, end: muchLater }],
  ["/gatherings/invite", { gathering: someId, version: someId, invitee: someId }],
  ["/gatherings/edit", { gathering: someId, expectedVersion: someId, purpose: "Fun", activity: "Movie", place: "Kendall", start: later, end: muchLater }],
  ["/gatherings/accept", { gathering: someId, version: someId }],
  ["/gatherings/decline", { gathering: someId, version: someId }],
  ["/gatherings/confirm", { gathering: someId, version: someId, expectedAttendees: [someId] }],
  ["/gatherings/withdraw", { gathering: someId, version: someId }],
  ["/gatherings/cancel", { gathering: someId, version: someId }],
  ["/gatherings/list", {}],
  ["/gatherings/get", { gathering: someId }],
  ["/notices/list", {}],
  ["/notices/mark-read", { notice: someId }],
];

async function expectEveryProtectedEndpointUnauthorized(api: ReturnType<typeof handler>, cookie?: string) {
  for (const [path, body] of protectedRequests) {
    const response = await api(post(path, body, cookie));
    expect({ path, status: response.status }).toEqual({ path, status: 401 });
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
  }
}

describe("OpenTime authentication at the system boundary", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(reset);
  afterAll(async () => { await reset(); await client.close(); });

  test("every protected endpoint refuses requests with no session cookie", async () => {
    await expectEveryProtectedEndpointUnauthorized(handler());
  });

  test("every protected endpoint refuses forged session cookies", async () => {
    const api = handler();
    await account(api, "john");
    for (const forged of [
      "__Host-opentime-session=made-up-session",
      `__Host-opentime-session=${crypto.randomUUID()}`,
      "__Host-opentime-session=",
    ]) {
      await expectEveryProtectedEndpointUnauthorized(api, forged);
    }
  });

  test("every protected endpoint refuses a session after sign-out", async () => {
    const api = handler();
    const john = await account(api, "john");
    expect((await api(post("/auth/sign-out", {}, john.cookie))).status).toBe(200);
    await expectEveryProtectedEndpointUnauthorized(api, john.cookie);
  });

  test("every protected endpoint refuses a session once it has expired", async () => {
    const api = handler();
    const john = await account(api, "john");
    expect((await api(post("/auth/current", {}, john.cookie))).status).toBe(200);
    await db.collection("authenticating.sessions").updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    await expectEveryProtectedEndpointUnauthorized(api, john.cookie);
  });

  test("a session id in the request body never authenticates; only the cookie does", async () => {
    const api = handler();
    const john = await account(api, "john");
    const eli = await account(api, "eli");
    const johnSession = john.cookie.split("=", 2)[1]!;
    const bodyOnly = await api(post("/auth/current", { session: johnSession }));
    expect(bodyOnly.status).toBe(401);
    const mixed = await api(post("/auth/current", { session: johnSession }, eli.cookie));
    expect(await mixed.json()).toEqual({ user: eli.user, username: "eli" });
  });

  test("register does not sign in; sign-in sets a cookie whose expiry matches the 30-minute session", async () => {
    const api = handler();
    const registered = await api(post("/auth/register", { username: "john", password }));
    expect(registered.status).toBe(200);
    expect(registered.headers.get("set-cookie")).toBeNull();
    const before = Date.now();
    const signedIn = await api(post("/auth/sign-in", { username: "john", password }));
    expect(await signedIn.json()).toEqual({});
    const setCookie = signedIn.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^__Host-opentime-session=[0-9a-f-]{36};/);
    expect(setCookie).toContain("Path=/");
    const expires = /Expires=([^;]+)/i.exec(setCookie)?.[1];
    expect(expires).toBeDefined();
    const lifetime = Date.parse(expires!) - before;
    expect(lifetime).toBeGreaterThan(29 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(30 * 60_000 + 1_000);
  });

  test("sign-out clears the browser cookie", async () => {
    const api = handler();
    const john = await account(api, "john");
    const signedOut = await api(post("/auth/sign-out", {}, john.cookie));
    const cleared = signedOut.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/^__Host-opentime-session=;/);
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  test("signing out on one device keeps the other device signed in", async () => {
    const api = handler();
    const { user } = await account(api, "john");
    const phone = cookieFrom(await api(post("/auth/sign-in", { username: "john", password })));
    const laptop = cookieFrom(await api(post("/auth/sign-in", { username: "john", password })));
    await api(post("/auth/sign-out", {}, laptop));
    expect((await api(post("/auth/current", {}, laptop))).status).toBe(401);
    expect(await (await api(post("/auth/current", {}, phone))).json()).toEqual({ user, username: "john" });
  });

  test("usernames are case-insensitive across registration, sign-in, and group invitations", async () => {
    const api = handler();
    const john = await account(api, "John");
    expect(await (await api(post("/auth/current", {}, john.cookie))).json()).toEqual({ user: john.user, username: "john" });
    expect((await api(post("/auth/register", { username: " JOHN ", password }))).status).toBe(409);
    expect((await api(post("/auth/sign-in", { username: "JOHN", password }))).status).toBe(200);
    const eli = await account(api, "eli");
    const { group } = (await (await api(post("/groups/create", { name: "Movie crew" }, john.cookie))).json()) as { group: string };
    expect((await api(post("/groups/invite", { group, username: "  ELI " }, john.cookie))).status).toBe(200);
    expect((await api(post("/groups/accept", { group }, eli.cookie))).status).toBe(200);
  });

  test("weak, blank, and malformed credentials are refused as invalid requests", async () => {
    const api = handler();
    for (const body of [
      { username: "eli", password: "short" },
      { username: "eli", password: "1234567" },
      { username: "   ", password },
      { username: "eli", password: "        " },
      { username: { $ne: null }, password },
      { username: "eli", password: 12345678 },
      { username: "eli" },
    ]) {
      const response = await api(post("/auth/register", body));
      expect({ body, status: response.status }).toEqual({ body, status: 400 });
    }
    expect(await db.collection("authenticating.users").countDocuments()).toBe(0);
    expect((await api(post("/auth/register", { username: "eli", password: "12345678" }))).status).toBe(200);
  });

  test("failed sign-ins do not reveal whether a username exists", async () => {
    const api = handler();
    await account(api, "john");
    const wrongPassword = await api(post("/auth/sign-in", { username: "john", password: "wrong password" }));
    const unknownUser = await api(post("/auth/sign-in", { username: "nobody", password }));
    expect(wrongPassword.status).toBe(400);
    expect(unknownUser.status).toBe(400);
    expect(await wrongPassword.json()).toEqual(await unknownUser.json());
    expect(wrongPassword.headers.get("set-cookie")).toBeNull();
  });

  test("another origin cannot use a session, sign out a user, or plant a session cookie", async () => {
    const api = handler();
    const john = await account(api, "john");
    const evil = "https://evil.example";
    for (const [path, body] of [["/auth/current", {}], ["/auth/sign-out", {}], ["/groups/create", { name: "Phishing crew" }]] as const) {
      const response = await api(post(path, body, john.cookie, evil));
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
    }
    const forgedSignIn = await api(post("/auth/sign-in", { username: "john", password }, undefined, evil));
    expect(forgedSignIn.status).toBe(403);
    expect(forgedSignIn.headers.get("set-cookie")).toBeNull();
    // Registration carries no credentials and issues no cookie; a cross-origin page also
    // receives no CORS grant, so it cannot read the result. It is equivalent to a direct call.
    const crossOriginRegister = await api(post("/auth/register", { username: "victim", password }, undefined, evil));
    expect(crossOriginRegister.headers.get("set-cookie")).toBeNull();
    expect(crossOriginRegister.headers.get("access-control-allow-origin")).toBeNull();
    expect(await db.collection("grouping.groups").countDocuments()).toBe(0);
    expect((await api(post("/auth/current", {}, john.cookie))).status).toBe(200);
  });

  test("each user's session acts only as that user", async () => {
    const api = handler();
    const john = await account(api, "john");
    const eli = await account(api, "eli");
    const { group } = (await (await api(post("/groups/create", { name: "John's group" }, john.cookie))).json()) as { group: string };
    expect((await api(post("/groups/close", { group }, eli.cookie))).status).toBe(403);
    expect((await api(post("/groups/link", { group }, eli.cookie))).status).not.toBe(200);
    expect((await api(post("/groups/link", { group }, john.cookie))).status).toBe(200);
  });
});
