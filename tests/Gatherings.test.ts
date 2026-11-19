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

describe("OpenTime gathering boundary", () => {
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
    expect(await (await api(post("/openings/overlap", overlapSearch, john.cookie))).json()).toEqual({ overlaps: [], suggestions: [] });
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
    expect((await api(post("/gatherings/accept", { gathering, version }, walker.cookie))).status).toBe(403);
  });

  test("edits a confirmed version, requires fresh responses, reconfirms, and permits a late join", async () => {
    const api = handler();
    async function account(username: string) {
      const { user } = await (await api(post("/auth/register", { username, password: "safe password" }))).json() as { user: string };
      const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0] };
    }
    const john = await account("john"), walker = await account("walker"), eli = await account("eli"), noah = await account("noah");
    const group = (await (await api(post("/groups/create", { name: "Movie crew" }, john.cookie))).json() as { group: string }).group;
    for (const [name, member] of [["walker", walker], ["eli", eli], ["noah", noah]] as const) {
      await api(post("/groups/invite", { group, username: name }, john.cookie));
      await api(post("/groups/accept", { group }, member.cookie));
    }
    const start = at(3), end = at(5);
    const proposed = await api(post("/gatherings/propose", {
      group, invitees: [walker.user, eli.user, noah.user], purpose: "movie", activity: "Original film", place: "Lounge", start, end,
    }, john.cookie));
    expect(proposed.status).toBe(200);
    const { gathering, version: firstVersion } = await proposed.json() as { gathering: string; version: string };
    for (const member of [walker, eli]) expect((await api(post("/gatherings/accept", { gathering, version: firstVersion }, member.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/confirm", { gathering, version: firstVersion, expectedAttendees: [john.user, walker.user, eli.user] }, john.cookie))).status).toBe(200);
    const concept = new GatheringConcept(db);
    expect((await concept._commitmentsFor({ users: [john.user, walker.user, eli.user], from: start, to: end, now: new Date() })).commitments).toHaveLength(3);

    const editBody = { gathering, expectedVersion: firstVersion, purpose: "movie", activity: "Revised film", place: "Lounge", start, end };
    expect((await api(post("/gatherings/edit", editBody, walker.cookie))).status).toBe(409);
    const edited = await api(post("/gatherings/edit", editBody, john.cookie));
    expect(edited.status).toBe(200);
    const { version: secondVersion } = await edited.json() as { version: string };
    expect(secondVersion).not.toBe(firstVersion);
    expect((await api(post("/gatherings/edit", editBody, john.cookie))).status).toBe(409);
    expect((await api(post("/gatherings/accept", { gathering, version: firstVersion }, walker.cookie))).status).toBe(409);
    expect((await concept._commitmentsFor({ users: [john.user, walker.user, eli.user], from: start, to: end, now: new Date() })).commitments).toHaveLength(0);
    const updated = await (await api(post("/gatherings/list", {}, walker.cookie))).json() as { gatherings: { number: number; myResponse: string; status: string }[] };
    expect(updated.gatherings[0]).toMatchObject({ number: 2, myResponse: "PENDING", status: "PROPOSED" });
    const saved = await db.collection<{ _id: string; versions: { version: string; activity: string; responses: Record<string, string> }[] }>("gathering.gatherings").findOne({ _id: gathering });
    expect(saved?.versions).toHaveLength(2);
    expect(saved?.versions[0]?.activity).toBe("Original film");
    expect(saved?.versions[0]?.responses[walker.user]).toBe("ACCEPTED");
    expect(saved?.versions[1]?.responses[walker.user]).toBe("PENDING");
    expect((await api(post("/gatherings/accept", { gathering, version: secondVersion }, walker.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/decline", { gathering, version: secondVersion }, eli.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/confirm", { gathering, version: secondVersion, expectedAttendees: [john.user, walker.user, eli.user] }, john.cookie))).status).toBe(409);
    expect((await api(post("/gatherings/confirm", { gathering, version: secondVersion, expectedAttendees: [john.user, walker.user] }, john.cookie))).status).toBe(200);
    const late = await api(post("/gatherings/accept", { gathering, version: secondVersion }, noah.cookie));
    expect(late.status).toBe(200);
    expect(await late.json()).toMatchObject({ joined: true });
    const details = await (await api(post("/gatherings/get", { gathering }, john.cookie))).json() as { attendees: string[]; status: string };
    expect(details.status).toBe("CONFIRMED");
    expect(details.attendees).toEqual([john.user, walker.user, noah.user]);
    expect((await concept._commitmentsFor({ users: [john.user, walker.user, eli.user, noah.user], from: start, to: end, now: new Date() })).commitments).toHaveLength(3);
  });

  test("serializes two late joins by one user into overlapping confirmed gatherings", async () => {
    const concept = new GatheringConcept(db);
    const start = at(3), end = at(4);
    const first = await concept.propose({ organizer: "john", context: "group", invitees: ["walker", "noah"], purpose: "movie", activity: "Film", place: "Lounge", start, end });
    const second = await concept.propose({ organizer: "eli", context: "group", invitees: ["sam", "noah"], purpose: "study", activity: "Review", place: "Library", start, end });
    await concept.accept({ user: "walker", ...first });
    await concept.accept({ user: "sam", ...second });
    await concept.confirm({ user: "john", ...first, expectedAttendees: ["john", "walker"] });
    await concept.confirm({ user: "eli", ...second, expectedAttendees: ["eli", "sam"] });
    const attempts = await Promise.allSettled([
      concept.accept({ user: "noah", ...first }), concept.accept({ user: "noah", ...second }),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected" && item.reason instanceof GatheringConflict)).toHaveLength(1);
    expect((await concept._commitmentsFor({ users: ["noah"], from: start, to: end, now: new Date() })).commitments).toHaveLength(1);
  });

  test("adds an invitee to a confirmed version without changing attendance until acceptance", async () => {
    const api = handler();
    async function account(username: string) {
      const { user } = await (await api(post("/auth/register", { username, password: "safe password" }))).json() as { user: string };
      const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0] };
    }
    const john = await account("john"), walker = await account("walker"), noah = await account("noah"), outsider = await account("outsider");
    const group = (await (await api(post("/groups/create", { name: "Movie crew" }, john.cookie))).json() as { group: string }).group;
    for (const [name, member] of [["walker", walker], ["noah", noah]] as const) {
      await api(post("/groups/invite", { group, username: name }, john.cookie));
      await api(post("/groups/accept", { group }, member.cookie));
    }
    const start = at(3), end = at(4);
    const { gathering, version } = await (await api(post("/gatherings/propose", { group, invitees: [walker.user], purpose: "movie", activity: "Film", place: "Lounge", start, end }, john.cookie))).json() as { gathering: string; version: string };
    await api(post("/gatherings/accept", { gathering, version }, walker.cookie));
    await api(post("/gatherings/confirm", { gathering, version, expectedAttendees: [john.user, walker.user] }, john.cookie));
    const invite = { gathering, version, invitee: noah.user };
    expect((await api(post("/gatherings/invite", invite, walker.cookie))).status).toBe(403);
    expect(await (await api(post("/gatherings/invite", { ...invite, invitee: outsider.user }, john.cookie))).json()).toMatchObject({ error: "FORBIDDEN" });
    expect((await api(post("/gatherings/invite", invite, john.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/invite", invite, john.cookie))).status).toBe(403);
    const pending = await (await api(post("/gatherings/list", {}, noah.cookie))).json() as { gatherings: { myResponse: string; status: string; attendees: string[] }[] };
    expect(pending.gatherings[0]).toMatchObject({ myResponse: "PENDING", status: "CONFIRMED", attendees: [john.user, walker.user] });
    expect(await (await api(post("/gatherings/accept", { gathering, version }, noah.cookie))).json()).toMatchObject({ joined: true });
    expect((await api(post("/gatherings/withdraw", { gathering, version }, noah.cookie))).status).toBe(200);
    expect((await api(post("/gatherings/invite", invite, john.cookie))).status).toBe(200);
    expect((await (await api(post("/gatherings/list", {}, noah.cookie))).json() as { gatherings: { myResponse: string }[] }).gatherings[0]?.myResponse).toBe("PENDING");
  });

  test("withdrawal keeps a pending invitee able to join, then closes when no invitees remain pending", async () => {
    const concept = new GatheringConcept(db);
    const start = at(3), end = at(4);
    const plan = await concept.propose({ organizer: "john", context: "group", invitees: ["walker", "noah"], purpose: "movie", activity: "Film", place: "Lounge", start, end });
    await concept.accept({ user: "walker", ...plan });
    await concept.confirm({ user: "john", ...plan, expectedAttendees: ["john", "walker"] });
    expect(await concept.withdraw({ user: "walker", ...plan })).toMatchObject({ status: "CONFIRMED", affectedUsers: ["john"] });
    expect((await concept._commitmentsFor({ users: ["walker"], from: start, to: end, now: new Date() })).commitments).toHaveLength(0);
    expect((await concept._commitmentsFor({ users: ["john"], from: start, to: end, now: new Date() })).commitments).toHaveLength(1);
    await concept.decline({ user: "noah", ...plan });
    await concept.accept({ user: "walker", ...plan });
    expect(await concept.withdraw({ user: "walker", ...plan })).toMatchObject({ status: "CANCELLED", affectedUsers: ["john", "noah"] });
    expect((await concept._commitmentsFor({ users: ["john"], from: start, to: end, now: new Date() })).commitments).toHaveLength(0);
    await expect(concept.accept({ user: "noah", ...plan })).rejects.toThrow();
  });

  test("organizer cancellation releases commitments and rejects stale changes", async () => {
    const concept = new GatheringConcept(db);
    const start = at(3), end = at(4);
    const plan = await concept.propose({ organizer: "john", context: "group", invitees: ["walker"], purpose: "movie", activity: "Film", place: "Lounge", start, end });
    await concept.accept({ user: "walker", ...plan });
    await concept.confirm({ user: "john", ...plan, expectedAttendees: ["john", "walker"] });
    await expect(concept.cancel({ user: "walker", ...plan })).rejects.toThrow();
    expect(await concept.cancel({ user: "john", ...plan })).toEqual({ affectedUsers: ["walker"] });
    expect((await concept._commitmentsFor({ users: ["john", "walker"], from: start, to: end, now: new Date() })).commitments).toHaveLength(0);
    await expect(concept.cancel({ user: "john", ...plan })).rejects.toThrow();
    await expect(concept.edit({ user: "john", gathering: plan.gathering, expectedVersion: plan.version, purpose: "movie", activity: "New film", place: "Lounge", start, end })).rejects.toThrow();
  });
});
