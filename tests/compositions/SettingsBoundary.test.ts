import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../../src/assembly.ts";
import { ContactingConcept } from "../../src/concepts/Contacting.ts";
import { policy } from "../../src/http.ts";

// System-level settings tests: real HTTP handler, cookies, compositions, and MongoDB.

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for settings boundary tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_settings_boundary_test";
const client = new MongoClient(testUrl.toString());
let db: Db;
const origin = "http://127.0.0.1:5173";
type Api = ReturnType<typeof handler>;

async function reset() {
  if (db.databaseName !== "opentime_settings_boundary_test") throw new Error("Refusing to reset another database.");
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
  const { user } = (await (await api(post("/auth/register", { username, password: "safe password" }))).json()) as { user: string };
  const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
  return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0]! };
}

async function json(api: Api, path: string, body: Record<string, unknown>, cookie?: string) {
  const response = await api(post(path, body, cookie));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** Reads the code from the queued email, as the address owner would. */
async function emailedCode(to: string) {
  const { emails } = await new ContactingConcept(db)._pendingEmails({ now: new Date(Date.now() + 60 * 60_000) });
  return /(\d{6})$/.exec(emails.filter((item) => item.to === to).at(-1)?.subject ?? "")?.[1] ?? "";
}

describe("OpenTime settings at the system boundary", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(reset);
  afterAll(async () => { await reset(); await client.close(); });

  test("every settings endpoint requires a session", async () => {
    const api = handler();
    for (const [path, body] of [
      ["/settings/get", {}], ["/settings/reminders", { leadMinutes: 30, timeZone: "UTC" }],
      ["/settings/email/request", { email: "a@example.com" }], ["/settings/email/verify", { code: "123456" }],
      ["/settings/email/remove", {}], ["/settings/email/reminders", { enabled: false }],
    ] as const) {
      expect({ path, status: (await api(post(path, body))).status }).toEqual({ path, status: 401 });
    }
  });

  test("a new account sees the default settings", async () => {
    const api = handler();
    const walker = await account(api, "walker");
    expect(await json(api, "/settings/get", {}, walker.cookie)).toEqual({ status: 200, body: {
      leadMinutes: 60, timeZone: "America/New_York", contact: { email: "", pendingEmail: "", emailReminders: true },
    } });
  });

  test("saves a reminder time between 1 minute and 24 hours and refuses anything else", async () => {
    const api = handler();
    const walker = await account(api, "walker");
    expect(await json(api, "/settings/reminders", { leadMinutes: 15, timeZone: "America/Chicago" }, walker.cookie)).toEqual({ status: 200, body: { saved: true } });
    expect((await json(api, "/settings/get", {}, walker.cookie)).body).toMatchObject({ leadMinutes: 15, timeZone: "America/Chicago" });
    for (const body of [
      { leadMinutes: 0, timeZone: "UTC" }, { leadMinutes: 1441, timeZone: "UTC" }, { leadMinutes: 2.5, timeZone: "UTC" },
      { leadMinutes: 30, timeZone: "Nowhere/City" }, { leadMinutes: "30", timeZone: "UTC" }, { leadMinutes: 30 },
    ]) {
      expect({ body, status: (await api(post("/settings/reminders", body, walker.cookie))).status }).toEqual({ body, status: 400 });
    }
    expect((await json(api, "/settings/get", {}, walker.cookie)).body).toMatchObject({ leadMinutes: 15 });
  });

  test("verifies an email with the emailed code; the code never appears in any response", async () => {
    const api = handler();
    const walker = await account(api, "walker");
    const requested = await json(api, "/settings/email/request", { email: "Walker@Example.com" }, walker.cookie);
    expect(requested).toEqual({ status: 200, body: { sent: true } });
    const code = await emailedCode("walker@example.com");
    const settings = await json(api, "/settings/get", {}, walker.cookie);
    expect(settings.body.contact).toEqual({ email: "", pendingEmail: "walker@example.com", emailReminders: true });
    expect(JSON.stringify([requested, settings])).not.toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await api(post("/settings/email/verify", { code: wrong }, walker.cookie))).status).toBe(400);
    expect(await json(api, "/settings/email/verify", { code }, walker.cookie)).toEqual({ status: 200, body: { email: "walker@example.com" } });
    expect((await json(api, "/settings/get", {}, walker.cookie)).body.contact).toEqual({ email: "walker@example.com", pendingEmail: "", emailReminders: true });
  });

  test("refuses bad addresses, too-fast repeats, and codes with nothing pending", async () => {
    const api = handler();
    const walker = await account(api, "walker");
    expect((await api(post("/settings/email/request", { email: "not-an-email" }, walker.cookie))).status).toBe(400);
    expect((await api(post("/settings/email/verify", { code: "123456" }, walker.cookie))).status).toBe(404);
    expect((await api(post("/settings/email/request", { email: "walker@example.com" }, walker.cookie))).status).toBe(200);
    expect((await api(post("/settings/email/request", { email: "walker@example.com" }, walker.cookie))).status).toBe(409);
  });

  test("email reminders can be switched off and the address removed", async () => {
    const api = handler();
    const walker = await account(api, "walker");
    await api(post("/settings/email/request", { email: "walker@example.com" }, walker.cookie));
    await api(post("/settings/email/verify", { code: await emailedCode("walker@example.com") }, walker.cookie));
    expect(await json(api, "/settings/email/reminders", { enabled: false }, walker.cookie)).toEqual({ status: 200, body: { saved: true } });
    expect((await json(api, "/settings/get", {}, walker.cookie)).body.contact).toMatchObject({ emailReminders: false });
    expect((await api(post("/settings/email/reminders", { enabled: "no" }, walker.cookie))).status).toBe(400);
    expect(await json(api, "/settings/email/remove", {}, walker.cookie)).toEqual({ status: 200, body: { removed: true } });
    expect((await json(api, "/settings/get", {}, walker.cookie)).body.contact).toMatchObject({ email: "", pendingEmail: "" });
  });

  test("each user's settings and codes are their own", async () => {
    const api = handler();
    const walker = await account(api, "walker");
    const eli = await account(api, "eli");
    await api(post("/settings/reminders", { leadMinutes: 5, timeZone: "UTC" }, walker.cookie));
    await api(post("/settings/email/request", { email: "walker@example.com" }, walker.cookie));
    const code = await emailedCode("walker@example.com");
    expect((await api(post("/settings/email/verify", { code }, eli.cookie))).status).toBe(404);
    expect(await json(api, "/settings/get", {}, eli.cookie)).toEqual({ status: 200, body: {
      leadMinutes: 60, timeZone: "America/New_York", contact: { email: "", pendingEmail: "", emailReminders: true },
    } });
    expect((await json(api, "/settings/get", {}, walker.cookie)).body).toMatchObject({ leadMinutes: 5, contact: { pendingEmail: "walker@example.com" } });
  });
});
