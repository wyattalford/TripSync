import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { DEFAULT_LEAD_MINUTES, DEFAULT_TIME_ZONE, InvalidReminder, RemindingConcept, isTimeZone } from "../../src/concepts/Reminding.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for Reminding tests.");
const databaseName = `opentime_reminding_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const client = new MongoClient(testUrl.toString());
let db: Db;
let reminding: RemindingConcept;

async function reset() {
  if (db.databaseName !== databaseName || !databaseName.startsWith("opentime_reminding_")) throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

describe("Reminding", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => { await reset(); reminding = new RemindingConcept(db, () => new Date("2030-01-01T12:00:00.000Z")); });
  afterAll(async () => { await reset(); await client.close(); });

  test("defaults to one hour in Boston time until the user chooses", async () => {
    expect(DEFAULT_LEAD_MINUTES).toBe(60);
    expect(DEFAULT_TIME_ZONE).toBe("America/New_York");
    expect(await reminding._preferences({ user: "walker" })).toEqual({ leadMinutes: 60, timeZone: "America/New_York" });
  });

  test("saves any whole number of minutes from 1 to 1440 and a real time zone", async () => {
    for (const leadMinutes of [1, 2, 59, 60, 90, 1439, 1440]) {
      expect(await reminding.setPreferences({ user: "walker", leadMinutes, timeZone: "America/Los_Angeles" })).toEqual({});
      expect(await reminding._preferences({ user: "walker" })).toEqual({ leadMinutes, timeZone: "America/Los_Angeles" });
    }
  });

  test("refuses lead times outside 1 minute to 24 hours and unknown time zones without changing state", async () => {
    await reminding.setPreferences({ user: "walker", leadMinutes: 30, timeZone: "Europe/London" });
    const invalid: [number, string][] = [
      [0, "UTC"], [-5, "UTC"], [1441, "UTC"], [1.5, "UTC"], [Number.NaN, "UTC"], [Number.POSITIVE_INFINITY, "UTC"],
      [30, ""], [30, "Mars/Olympus"], [30, "x".repeat(65)],
    ];
    for (const [leadMinutes, timeZone] of invalid) {
      await expect(reminding.setPreferences({ user: "walker", leadMinutes, timeZone })).rejects.toBeInstanceOf(InvalidReminder);
    }
    expect(await reminding._preferences({ user: "walker" })).toEqual({ leadMinutes: 30, timeZone: "Europe/London" });
  });

  test("isTimeZone accepts IANA names and UTC", () => {
    for (const zone of ["UTC", "America/New_York", "Asia/Kolkata", "Africa/Kigali"]) expect(isTimeZone(zone)).toBe(true);
    for (const zone of ["", "EST5EDT/Invalid", "Not/AZone"]) expect(isTimeZone(zone)).toBe(false);
  });

  test("preferences are per user, with defaults for users who never chose", async () => {
    await reminding.setPreferences({ user: "walker", leadMinutes: 15, timeZone: "UTC" });
    expect(await reminding._preferencesFor({ users: ["walker", "eli"] })).toEqual({ preferences: [
      { user: "walker", leadMinutes: 15, timeZone: "UTC" },
      { user: "eli", leadMinutes: 60, timeZone: "America/New_York" },
    ] });
    expect(await reminding._preferencesFor({ users: [] })).toEqual({ preferences: [] });
  });

  test("records each user's reminder for a version exactly once", async () => {
    expect(await reminding._recorded({ user: "walker", version: "v1" })).toEqual({ recorded: false });
    expect(await reminding.record({ user: "walker", gathering: "g1", version: "v1" })).toEqual({ first: true });
    expect(await reminding.record({ user: "walker", gathering: "g1", version: "v1" })).toEqual({ first: false });
    expect(await reminding._recorded({ user: "walker", version: "v1" })).toEqual({ recorded: true });
    expect(await reminding.record({ user: "eli", gathering: "g1", version: "v1" })).toEqual({ first: true });
    expect(await reminding.record({ user: "walker", gathering: "g1", version: "v2" })).toEqual({ first: true });
  });

  test("concurrent records for the same reminder admit exactly one first", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => reminding.record({ user: "walker", gathering: "g1", version: "v1" })));
    expect(results.filter((result) => result.first)).toHaveLength(1);
  });
});
