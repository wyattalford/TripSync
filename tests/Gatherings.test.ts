import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../src/assembly.ts";
import { GatheringConcept, GatheringConflict } from "../src/concepts/Gathering.ts";
import { policy } from "../src/http.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for gathering tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_gatherings_test";
const client = new MongoClient(testUrl.toString());
let db: Db;

async function resetTestDatabase() {
  if (db.databaseName !== "opentime_gatherings_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}
function at(hours: number) { return new Date(Date.now() + hours * 3_600_000).toISOString(); }
function post(path: string, body: Record<string, unknown> = {}, cookie?: string) {
  return new Request(`http://127.0.0.1:5173/api${path}`, { method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body) });
}
function handler() {
  const application = assembleApplication(db);
  return createHttpHandler({ application, gateway: createGateway({ application }), policy });
}

describe("OpenTime first gathering confirmation", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(resetTestDatabase);
  afterAll(async () => { await resetTestDatabase(); await client.close(); });

  test("keeps silence pending, confirms the exact roster, and masks commitments", async () => {
    const api = handler();
    async function account(username: string) {
      const registered = await api(post("/auth/register", { username, password: "safe password" }));
      const { user } = await registered.json() as { user: string };
      const signIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return { user, cookie: signIn.headers.get("set-cookie")!.split(";", 1)[0] };
    }
    const john = await account("john"), walker = await account("walker"), eli = await account("eli"), noah = await account("noah"), outsider = await account("outsider");
    const group = (await (await api(post("/groups/create", { name: "Movie crew" }, john.cookie))).json() as { group: string }).group;
    for (const member of [walker, eli, noah]) {
      await api(post("/groups/invite", { group, username: member === walker ? "walker" : member === eli ? "eli" : "noah" }, john.cookie));
      await api(post("/groups/accept", { group }, member.cookie));
    }
    const roster = await api(post("/groups/members", { group }, john.cookie));
    expect((await roster.json() as { accounts: { username: string }[] }).accounts.map((account) => account.username).sort()).toEqual(["eli", "john", "noah", "walker"]);
    expect((await api(post("/groups/members", { group }, outsider.cookie))).status).toBe(403);
    const start = at(2), end = at(5);
    for (const member of [john, walker, eli, noah]) {
      const created = await api(post("/openings/create", { purpose: "movie", start, end }, member.cookie));
      const { opening } = await created.json() as { opening: string };
      await api(post("/openings/publish", { opening, audiences: [group] }, member.cookie));
    }
    const overlapSearch = { group, purpose: "movie", from: start, to: end, duration: 60 };
    expect((await (await api(post("/openings/overlap", overlapSearch, john.cookie))).json() as { overlaps: unknown[] }).overlaps).toHaveLength(1);
    const proposed = await api(post("/gatherings/propose", { group, invitees: [walker.user, eli.user, noah.user], purpose: "movie", activity: "Star Wars", place: "Dorm lounge", start, end }, john.cookie));
    expect(proposed.status).toBe(200);
    const { gathering, version } = await proposed.json() as { gathering: string; version: string };
    expect((await api(post("/gatherings/get", { gathering }, outsider.cookie))).status).toBe(403);
    const noahList = await api(post("/gatherings/list", {}, noah.cookie));
    expect((await noahList.json() as { gatherings: { myResponse: string }[] }).gatherings[0]?.myResponse).toBe("PENDING");
    expect((await api(post("/gatherings/accept", { gathering, version }, walker.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/accept", { gathering, version }, eli.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user, walker.user] }, john.cookie))).status).toBe(409);
    expect((await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user, walker.user, eli.user] }, outsider.cookie))).status).toBe(403);
    const confirmed = await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user, walker.user, eli.user] }, john.cookie));
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json() as { attendees: string[] }).attendees).toEqual([john.user, walker.user, eli.user]);
    const detail = await api(post("/gatherings/get", { gathering }, noah.cookie));
    expect((await detail.json() as { status: string; accepted: string[] }).status).toBe("CONFIRMED");
    expect((await (await api(post("/gatherings/list", {}, noah.cookie))).json() as { gatherings: { myResponse: string }[] }).gatherings[0]?.myResponse).toBe("PENDING");
    expect(await (await api(post("/openings/overlap", overlapSearch, john.cookie))).json()).toEqual({ overlaps: [] });
  });

  test("serializes competing confirmations for a shared attendee", async () => {
    const concept = new GatheringConcept(db);
    const start = at(3), end = at(4);
    const first = await concept.propose({ organizer: "john", context: "group", invitees: ["walker"], purpose: "movie", activity: "Film", place: "Lounge", start, end });
    const second = await concept.propose({ organizer: "eli", context: "group", invitees: ["walker"], purpose: "study", activity: "Review", place: "Library", start, end });
    await concept.accept({ user: "walker", ...first });
    await concept.accept({ user: "walker", ...second });
    const attempts = await Promise.allSettled([
      concept.confirm({ user: "john", ...first, expectedAttendees: ["john", "walker"] }),
      concept.confirm({ user: "eli", ...second, expectedAttendees: ["eli", "walker"] }),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected" && item.reason instanceof GatheringConflict)).toHaveLength(1);
    const committed = await db.collection("gathering.gatherings").countDocuments({ status: "CONFIRMED" });
    expect(committed).toBe(1);
  });

  test("allows a decline to be reconsidered before confirmation, then rejects stale responses", async () => {
    const api = handler();
    async function account(username: string) {
      const { user } = await (await api(post("/auth/register", { username, password: "safe password" }))).json() as { user: string };
      const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0] };
    }
    const john = await account("john"), walker = await account("walker");
    const group = (await (await api(post("/groups/create", { name: "Friends" }, john.cookie))).json() as { group: string }).group;
    await api(post("/groups/invite", { group, username: "walker" }, john.cookie));
    await api(post("/groups/accept", { group }, walker.cookie));
    const { gathering, version } = await (await api(post("/gatherings/propose", { group, invitees: [walker.user], purpose: "dinner", activity: "Pizza", place: "Kitchen", start: at(2), end: at(3) }, john.cookie))).json() as { gathering: string; version: string };
    expect((await api(post("/gatherings/decline", { gathering, version }, walker.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user] }, john.cookie))).status).toBe(409);
    expect((await api(post("/gatherings/accept", { gathering, version }, walker.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user, walker.user] }, john.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/accept", { gathering, version }, walker.cookie))).status).toBe(409);
  });
});
