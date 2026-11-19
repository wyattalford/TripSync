import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../src/assembly.ts";
import { AuthenticatingConcept, UnknownSession } from "../src/concepts/Authenticating.ts";
import { policy } from "../src/http.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for account tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_accounts_test";
const client = new MongoClient(testUrl.toString());
let db: Db;

async function resetTestDatabase() {
  if (db.databaseName !== "opentime_accounts_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function post(path: string, body: Record<string, unknown>, cookie?: string) {
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

describe("OpenTime account boundary", () => {
  beforeAll(async () => {
    await client.connect();
    db = client.db();
  });
  beforeEach(resetTestDatabase);
  afterAll(async () => {
    await resetTestDatabase();
    await client.close();
  });

  test("registers, issues an HttpOnly cookie, restores a session, and revokes it", async () => {
    const api = handler();
    const register = await api(post("/auth/register", { username: "john", password: "safe password" }));
    expect(register.status).toBe(200);
    const { user } = (await register.json()) as { user: string };
    expect(typeof user).toBe("string");
    const stored = await db.collection<{ _id: string; passwordVerifier: string }>("authenticating.users").findOne({ _id: user });
    expect(stored?.passwordVerifier).not.toBe("safe password");

    const signIn = await api(post("/auth/sign-in", { username: "john", password: "safe password" }));
    expect(signIn.status).toBe(200);
    expect(await signIn.json()).toEqual({});
    const setCookie = signIn.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-opentime-session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");
    const cookie = setCookie.split(";", 1)[0];

    const restored = await handler()(post("/auth/current", {}, cookie));
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ user, username: "john" });
    const spoofed = await api(post("/auth/current", { session: "made-up-session" }, cookie));
    expect(await spoofed.json()).toEqual({ user, username: "john" });

    const signOut = await api(post("/auth/sign-out", {}, cookie));
    expect(signOut.status).toBe(200);
    expect(await signOut.json()).toEqual({ signedOut: true });
    expect(signOut.headers.get("set-cookie")).toContain("__Host-opentime-session=");
    const after = await api(post("/auth/current", {}, cookie));
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  test("rejects duplicate usernames and incorrect credentials", async () => {
    const api = handler();
    expect((await api(post("/auth/register", { username: "eli", password: "safe password" }))).status).toBe(200);
    expect((await api(post("/auth/register", { username: "eli", password: "another password" }))).status).toBe(409);
    expect((await api(post("/auth/sign-in", { username: "eli", password: "wrong password" }))).status).toBe(400);
    expect((await api(post("/auth/register", { username: "", password: "safe password" }))).status).toBe(400);
    expect((await api(post("/auth/sign-in", { username: { $ne: null }, password: "safe password" }))).status).toBe(400);
  });

  test("expires a session at its recorded deadline", async () => {
    let now = new Date("2026-11-18T12:00:00.000Z");
    const auth = new AuthenticatingConcept(db, () => now);
    await auth.register({ username: "walker", password: "safe password" });
    const { session } = await auth.signIn({ username: "walker", password: "safe password" });
    now = new Date("2026-11-18T12:30:00.000Z");
    await expect(auth.authenticate({ session })).rejects.toThrow(UnknownSession);
  });
});
