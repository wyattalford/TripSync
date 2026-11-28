import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  CodeCooldown, CodeExpired, ContactingConcept, InvalidCode, InvalidEmail, MAX_SEND_ATTEMPTS,
} from "../../src/concepts/Contacting.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for Contacting tests.");
const databaseName = `opentime_contacting_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const client = new MongoClient(testUrl.toString());
let db: Db;
let now: Date;
let contacting: ContactingConcept;
const baseTime = Date.parse("2030-01-01T12:00:00.000Z");
const MINUTE = 60_000;

async function reset() {
  if (db.databaseName !== databaseName || !databaseName.startsWith("opentime_contacting_")) throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function advance(ms: number) { now = new Date(now.getTime() + ms); }

/** The latest code emailed to an address (read from the outbox, as only the recipient could). */
async function latestCode(to: string) {
  const { emails } = await contacting._pendingEmails({ now: new Date(now.getTime() + 365 * 24 * 60 * MINUTE) });
  const subject = emails.filter((item) => item.to === to).at(-1)?.subject ?? "";
  return /(\d{6})$/.exec(subject)?.[1] ?? "";
}

async function storedContacts() {
  return db.collection("contacting.contacts").find().sort({ _id: 1 }).toArray();
}

async function verified(user: string, email: string) {
  await contacting.requestVerification({ user, email });
  await contacting.verify({ user, code: await latestCode(email.toLowerCase()) });
}

describe("Contacting", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => {
    await reset();
    now = new Date(baseTime);
    contacting = new ContactingConcept(db, () => now);
  });
  afterAll(async () => { await reset(); await client.close(); });

  test("principle: an address is used only after its emailed code is entered", async () => {
    expect(await contacting._contact({ user: "walker" })).toEqual({ contact: { email: "", pendingEmail: "", emailReminders: true } });
    expect(await contacting.requestVerification({ user: "walker", email: " Walker@Example.com " })).toEqual({});
    expect(await contacting._contact({ user: "walker" })).toEqual({ contact: { email: "", pendingEmail: "walker@example.com", emailReminders: true } });
    expect(await contacting.sendToUser({ user: "walker", sourceKey: "r1", subject: "s", text: "t", html: "h" })).toEqual({ queued: false });
    const code = await latestCode("walker@example.com");
    expect(code).toMatch(/^\d{6}$/);
    expect(await contacting.verify({ user: "walker", code })).toEqual({ email: "walker@example.com" });
    expect(await contacting._contact({ user: "walker" })).toEqual({ contact: { email: "walker@example.com", pendingEmail: "", emailReminders: true } });
    expect(await contacting.sendToUser({ user: "walker", sourceKey: "r1", subject: "s", text: "t", html: "h" })).toEqual({ queued: true });
  });

  test("the code email goes only to the address being verified and the code is never stored in plain text", async () => {
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    const { emails } = await contacting._pendingEmails({ now });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "walker@example.com" });
    const code = await latestCode("walker@example.com");
    expect(emails[0]!.text).toContain(code);
    expect(JSON.stringify(await storedContacts())).not.toContain(code);
    expect(JSON.stringify(await contacting._contact({ user: "walker" }))).not.toContain(code);
  });

  test("refuses invalid addresses without changing state", async () => {
    for (const email of ["", "   ", "walker", "walker@", "@example.com", "walker@example", "a b@example.com", `${"x".repeat(250)}@example.com`]) {
      const before = await storedContacts();
      await expect(contacting.requestVerification({ user: "walker", email })).rejects.toBeInstanceOf(InvalidEmail);
      expect(await storedContacts()).toEqual(before);
    }
  });

  test("allows a new code only once per minute", async () => {
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    advance(59_000);
    await expect(contacting.requestVerification({ user: "walker", email: "walker@example.com" })).rejects.toBeInstanceOf(CodeCooldown);
    advance(1_000);
    expect(await contacting.requestVerification({ user: "walker", email: "walker@example.com" })).toEqual({});
  });

  test("simultaneous code requests send at most one code", async () => {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => contacting.requestVerification({ user: "walker", email: "walker@example.com" })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await contacting._pendingEmails({ now })).emails).toHaveLength(1);
  });

  test("a newer code replaces the older one", async () => {
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    const first = await latestCode("walker@example.com");
    advance(MINUTE);
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    const second = await latestCode("walker@example.com");
    if (first !== second) await expect(contacting.verify({ user: "walker", code: first })).rejects.toBeInstanceOf(InvalidCode);
    expect(await contacting.verify({ user: "walker", code: second })).toEqual({ email: "walker@example.com" });
  });

  test("a wrong code is refused and five wrong attempts use up the code", async () => {
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    const code = await latestCode("walker@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(contacting.verify({ user: "walker", code: wrong })).rejects.toBeInstanceOf(InvalidCode);
    }
    await expect(contacting.verify({ user: "walker", code })).rejects.toBeInstanceOf(CodeExpired);
    expect((await contacting._contact({ user: "walker" })).contact.email).toBe("");
  });

  test("codes expire after 15 minutes", async () => {
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    const code = await latestCode("walker@example.com");
    advance(15 * MINUTE);
    await expect(contacting.verify({ user: "walker", code })).rejects.toBeInstanceOf(CodeExpired);
  });

  test("verify without a pending address is refused", async () => {
    await expect(contacting.verify({ user: "walker", code: "123456" })).rejects.toBeInstanceOf(CodeExpired);
  });

  test("a code only works for the user it was sent to", async () => {
    await contacting.requestVerification({ user: "walker", email: "walker@example.com" });
    await contacting.requestVerification({ user: "eli", email: "eli@example.com" });
    const walkerCode = await latestCode("walker@example.com");
    const eliCode = await latestCode("eli@example.com");
    if (walkerCode !== eliCode) await expect(contacting.verify({ user: "eli", code: walkerCode })).rejects.toBeInstanceOf(InvalidCode);
    expect(await contacting.verify({ user: "eli", code: eliCode })).toEqual({ email: "eli@example.com" });
  });

  test("changing address keeps the old one in use until the new one is verified", async () => {
    await verified("walker", "old@example.com");
    advance(MINUTE);
    await contacting.requestVerification({ user: "walker", email: "new@example.com" });
    expect((await contacting._contact({ user: "walker" })).contact).toMatchObject({ email: "old@example.com", pendingEmail: "new@example.com" });
    await contacting.sendToUser({ user: "walker", sourceKey: "r1", subject: "s", text: "t", html: "h" });
    expect((await contacting._pendingEmails({ now })).emails.find((item) => item.subject === "s")?.to).toBe("old@example.com");
    await contacting.verify({ user: "walker", code: await latestCode("new@example.com") });
    expect((await contacting._contact({ user: "walker" })).contact.email).toBe("new@example.com");
  });

  test("turning email reminders off stops queuing; removing the address stops it too", async () => {
    await verified("walker", "walker@example.com");
    expect(await contacting.setEmailReminders({ user: "walker", enabled: false })).toEqual({});
    expect(await contacting.sendToUser({ user: "walker", sourceKey: "a", subject: "s", text: "t", html: "h" })).toEqual({ queued: false });
    await contacting.setEmailReminders({ user: "walker", enabled: true });
    expect(await contacting.sendToUser({ user: "walker", sourceKey: "b", subject: "s", text: "t", html: "h" })).toEqual({ queued: true });
    expect(await contacting.removeEmail({ user: "walker" })).toEqual({});
    expect((await contacting._contact({ user: "walker" })).contact).toEqual({ email: "", pendingEmail: "", emailReminders: true });
    expect(await contacting.sendToUser({ user: "walker", sourceKey: "c", subject: "s", text: "t", html: "h" })).toEqual({ queued: false });
  });

  test("the email preference can be set before any address exists", async () => {
    await contacting.setEmailReminders({ user: "walker", enabled: false });
    expect((await contacting._contact({ user: "walker" })).contact.emailReminders).toBe(false);
    await verified("walker", "walker@example.com");
    expect((await contacting._contact({ user: "walker" })).contact.emailReminders).toBe(false);
  });

  test("the same source key is queued only once per user, even concurrently", async () => {
    await verified("walker", "walker@example.com");
    await contacting.markSent({ email: (await contacting._pendingEmails({ now })).emails[0]!.email });
    await Promise.all(Array.from({ length: 5 }, () => contacting.sendToUser({ user: "walker", sourceKey: "reminder:v1", subject: "s", text: "t", html: "h" })));
    expect((await contacting._pendingEmails({ now })).emails).toHaveLength(1);
  });

  test("sent emails leave the queue; failures back off and give up after five attempts", async () => {
    await verified("walker", "walker@example.com");
    const [code] = (await contacting._pendingEmails({ now })).emails;
    await contacting.markSent({ email: code!.email });
    await contacting.sendToUser({ user: "walker", sourceKey: "r", subject: "s", text: "t", html: "h" });
    const [reminder] = (await contacting._pendingEmails({ now })).emails;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      await contacting.markFailed({ email: reminder!.email });
      expect((await contacting._pendingEmails({ now })).emails).toHaveLength(0);
      advance(2 ** attempt * MINUTE);
      expect((await contacting._pendingEmails({ now })).emails).toHaveLength(attempt < MAX_SEND_ATTEMPTS ? 1 : 0);
    }
    expect(await contacting.markFailed({ email: "missing" })).toEqual({});
  });
});
