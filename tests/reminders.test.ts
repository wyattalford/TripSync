import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { ContactingConcept } from "../src/concepts/Contacting.ts";
import { GatheringConcept } from "../src/concepts/Gathering.ts";
import { NotifyingConcept } from "../src/concepts/Notifying.ts";
import { RemindingConcept } from "../src/concepts/Reminding.ts";
import type { Email } from "../src/mailer.ts";
import { deliverPendingEmails, formatDuration, formatWhen, reminderContent, sendDueReminders, startsIn } from "../src/reminders.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for reminder tests.");
const databaseName = `opentime_reminders_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const client = new MongoClient(testUrl.toString());
let db: Db;
let now: Date;
const MINUTE = 60_000;
const origin = "https://opentime.example";
const group = crypto.randomUUID();

async function reset() {
  if (db.databaseName !== databaseName || !databaseName.startsWith("opentime_reminders_")) throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

const clock = () => now;
const gathering = () => new GatheringConcept(db, clock);
const notifying = () => new NotifyingConcept(db, clock);
const contacting = () => new ContactingConcept(db, clock);
const reminding = () => new RemindingConcept(db, clock);
const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE).toISOString();
const tick = () => sendDueReminders(db, { now, origin });

/** John proposes Film night starting in `startsInMinutes` to Walker and Eli; Walker accepts; John confirms. Eli stays pending. */
async function confirmedFilmNight(startsInMinutes: number) {
  const plan = await gathering().propose({
    organizer: "john", context: group, invitees: ["walker", "eli"], purpose: "movie", activity: "Film night", place: "Dorm lounge",
    start: at(startsInMinutes), end: at(startsInMinutes + 120),
  });
  await gathering().accept({ user: "walker", ...plan });
  await gathering().confirm({ user: "john", ...plan, expectedAttendees: ["john", "walker"] });
  return plan;
}

async function reminders(user: string) {
  return (await notifying()._inbox({ user })).notices.filter((item) => item.message.startsWith("Reminder:"));
}

async function verifiedEmail(user: string, email: string) {
  await contacting().requestVerification({ user, email });
  const pending = (await contacting()._pendingEmails({ now })).emails.filter((item) => item.to === email).at(-1)!;
  await contacting().verify({ user, code: /(\d{6})$/.exec(pending.subject)![1]! });
  await contacting().markSent({ email: pending.email });
}

describe("reminder worker", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => { await reset(); now = new Date(Date.UTC(2030, 0, 4, 22, 0)); });
  afterAll(async () => { await reset(); await client.close(); });

  test("reminds each confirmed attendee at their lead time, once, in the app", async () => {
    const { gathering: id } = await confirmedFilmNight(180);
    expect(await tick()).toEqual({ sent: 0 });
    now = new Date(now.getTime() + 119 * MINUTE); // 61 minutes before start
    expect(await tick()).toEqual({ sent: 0 });
    now = new Date(now.getTime() + MINUTE); // exactly 60 minutes before
    expect(await tick()).toEqual({ sent: 2 });
    for (const user of ["john", "walker"]) {
      expect(await reminders(user)).toEqual([expect.objectContaining({
        message: "Reminder: Film night at Dorm lounge starts in 1 hour", destination: `/gatherings/${id}`, readAt: null,
      })]);
    }
    expect(await reminders("eli")).toEqual([]);
    now = new Date(now.getTime() + 10 * MINUTE);
    expect(await tick()).toEqual({ sent: 0 });
    expect(await reminders("walker")).toHaveLength(1);
  });

  test("each attendee's own lead time decides when their reminder arrives", async () => {
    await reminding().setPreferences({ user: "walker", leadMinutes: 1, timeZone: "UTC" });
    await reminding().setPreferences({ user: "john", leadMinutes: 24 * 60, timeZone: "UTC" });
    await confirmedFilmNight(30 * 60);
    now = new Date(now.getTime() + 6 * 60 * MINUTE); // 24 h before start
    await tick();
    expect(await reminders("john")).toHaveLength(1);
    expect(await reminders("walker")).toHaveLength(0);
    now = new Date(now.getTime() + (24 * 60 - 2) * MINUTE); // 2 min before
    await tick();
    expect(await reminders("walker")).toHaveLength(0);
    now = new Date(now.getTime() + MINUTE); // 1 min before
    await tick();
    expect((await reminders("walker"))[0]!.message).toBe("Reminder: Film night at Dorm lounge starts in 1 minute");
  });

  test("a gathering confirmed inside the lead time is reminded on the next run, with the real time left", async () => {
    await confirmedFilmNight(20);
    await tick();
    expect((await reminders("walker"))[0]!.message).toBe("Reminder: Film night at Dorm lounge starts in 20 minutes");
  });

  test("no reminders for proposals, cancelled gatherings, or gatherings that already started", async () => {
    await gathering().propose({ organizer: "john", context: group, invitees: ["walker"], purpose: "p", activity: "Pizza", place: "Kitchen", start: at(30), end: at(60) });
    const cancelled = await confirmedFilmNight(40);
    await gathering().cancel({ user: "john", ...cancelled });
    await tick();
    expect(await reminders("walker")).toEqual([]);
    const started = await confirmedFilmNight(5 * 60);
    now = new Date(now.getTime() + 5 * 60 * MINUTE); // start time
    await tick();
    expect(await reminders("walker")).toEqual([]);
    expect(started.gathering).toBeTruthy();
  });

  test("withdrawing before the reminder means no reminder for that person", async () => {
    const plan = await confirmedFilmNight(180);
    await gathering().invite({ user: "john", ...plan, invitee: "eli" }).catch(() => {});
    await gathering().withdraw({ user: "walker", ...plan });
    now = new Date(now.getTime() + 120 * MINUTE);
    await tick();
    expect(await reminders("walker")).toEqual([]);
  });

  test("a late joiner is reminded too", async () => {
    const plan = await confirmedFilmNight(90);
    await gathering().accept({ user: "eli", ...plan });
    now = new Date(now.getTime() + 30 * MINUTE);
    await tick();
    expect(await reminders("eli")).toHaveLength(1);
  });

  test("editing the time after a reminder produces a new reminder for the new version", async () => {
    const plan = await confirmedFilmNight(50);
    await tick();
    expect(await reminders("walker")).toHaveLength(1);
    const { version } = await gathering().edit({
      user: "john", gathering: plan.gathering, expectedVersion: plan.version, purpose: "movie", activity: "Film night", place: "Dorm lounge",
      start: at(170), end: at(290),
    });
    await gathering().accept({ user: "walker", gathering: plan.gathering, version });
    await gathering().confirm({ user: "john", gathering: plan.gathering, version, expectedAttendees: ["john", "walker"] });
    await tick();
    expect(await reminders("walker")).toHaveLength(1);
    now = new Date(now.getTime() + 110 * MINUTE);
    await tick();
    expect(await reminders("walker")).toHaveLength(2);
  });

  test("emails the reminder only to attendees with a verified address and email reminders on", async () => {
    await verifiedEmail("walker", "walker@example.com");
    await verifiedEmail("john", "john@example.com");
    await contacting().setEmailReminders({ user: "john", enabled: false });
    await reminding().setPreferences({ user: "walker", leadMinutes: 60, timeZone: "America/New_York" });
    await confirmedFilmNight(45);
    await tick();
    const queued = (await contacting()._pendingEmails({ now })).emails;
    expect(queued.map((item) => item.to)).toEqual(["walker@example.com"]);
    expect(queued[0]!.subject).toBe("Reminder: Film night starts in 45 minutes");
    expect(queued[0]!.text).toContain("Fri, Jan 4, 5:45 PM EST");
    expect(queued[0]!.text).toContain(`${origin}/gatherings/`);
    await tick();
    expect((await contacting()._pendingEmails({ now })).emails).toHaveLength(1);
  });

  test("delivers queued emails, marks them sent, and retries failures later", async () => {
    await verifiedEmail("walker", "walker@example.com");
    await confirmedFilmNight(30);
    await tick();
    const sent: Email[] = [];
    let failNext = true;
    const mailer = async (item: Email) => { if (failNext) { failNext = false; throw new Error("provider down"); } sent.push(item); };
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await deliverPendingEmails(db, mailer, { now })).toEqual({ delivered: 0, attempted: 1 });
      expect(await deliverPendingEmails(db, mailer, { now })).toEqual({ delivered: 0, attempted: 0 });
      now = new Date(now.getTime() + 2 * MINUTE);
      expect(await deliverPendingEmails(db, mailer, { now })).toEqual({ delivered: 1, attempted: 1 });
    } finally { error.mockRestore(); }
    expect(sent.map((item) => item.to)).toEqual(["walker@example.com"]);
    expect(await deliverPendingEmails(db, mailer, { now })).toEqual({ delivered: 0, attempted: 0 });
  });
});

describe("reminder wording", () => {
  test("formats durations naturally", () => {
    expect(formatDuration(1)).toBe("1 minute");
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(90)).toBe("1 hour 30 minutes");
    expect(formatDuration(121)).toBe("2 hours 1 minute");
    expect(formatDuration(1440)).toBe("24 hours");
  });

  test("says how soon, never a negative time", () => {
    const now = new Date("2030-01-01T12:00:00Z");
    expect(startsIn(new Date("2030-01-01T12:00:30Z"), now)).toBe("in less than a minute");
    expect(startsIn(new Date("2030-01-01T13:00:00Z"), now)).toBe("in 1 hour");
  });

  test("shows the start in the attendee's own time zone", () => {
    expect(formatWhen("2030-01-04T22:30:00Z", "America/New_York")).toBe("Fri, Jan 4, 5:30 PM EST");
    expect(formatWhen("2030-01-04T22:30:00Z", "Africa/Kigali")).toBe("Sat, Jan 5, 12:30 AM GMT+2");
  });

  test("builds the notice, subject, text, and escaped HTML", () => {
    const content = reminderContent({ activity: "Film <night>", place: "Lounge", start: "2030-01-04T23:00:00Z" },
      { now: new Date("2030-01-04T22:00:00Z"), timeZone: "UTC", link: "https://x.test/gatherings/1" });
    expect(content.notice).toBe("Reminder: Film <night> at Lounge starts in 1 hour");
    expect(content.subject).toBe("Reminder: Film <night> starts in 1 hour");
    expect(content.text).toContain("https://x.test/gatherings/1");
    expect(content.html).toContain("Film &lt;night&gt;");
  });
});
