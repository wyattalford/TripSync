import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { assembleApplication } from "../src/assembly.ts";
import { AvailabilitySharingConcept, OpeningConflict } from "../src/concepts/AvailabilitySharing.ts";
import { policy } from "../src/http.ts";
import { readOverlapSnapshot } from "../src/overlapSnapshot.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for opening tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/opentime_openings_test";
const client = new MongoClient(testUrl.toString());
let db: Db;

async function resetTestDatabase() {
  if (db.databaseName !== "opentime_openings_test") throw new Error("Refusing to reset another database.");
  await db.dropDatabase();
}

function post(path: string, body: Record<string, unknown> = {}, cookie?: string) {
  return new Request(`http://127.0.0.1:5173/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function handler() {
  const application = assembleApplication(db);
  return createHttpHandler({ application, gateway: createGateway({ application }), policy });
}

function at(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

describe("OpenTime opening boundary", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(resetTestDatabase);
  afterAll(async () => { await resetTestDatabase(); await client.close(); });

  test("keeps openings private and returns only full-group intervals without a purpose", async () => {
    const api = handler();
    async function account(username: string) {
      expect((await api(post("/auth/register", { username, password: "safe password" }))).status).toBe(200);
      const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return signedIn.headers.get("set-cookie")!.split(";", 1)[0];
    }
    const john = await account("john");
    const walker = await account("walker");
    const noah = await account("noah");
    const group = (await (await api(post("/groups/create", { name: "Friends" }, john))).json() as { group: string }).group;
    await api(post("/groups/invite", { group, username: "walker" }, john));
    await api(post("/groups/accept", { group }, walker));
    await api(post("/groups/invite", { group, username: "noah" }, john));

    const from = at(2), to = at(5);
    const johnOpening = (await (await api(post("/openings/create", { start: from, end: to }, john))).json() as { opening: string }).opening;
    const walkerOpening = (await (await api(post("/openings/create", { start: at(3), end: at(5) }, walker))).json() as { opening: string }).opening;
    expect((await api(post("/openings/publish", { opening: johnOpening, audiences: [group] }, john))).status).toBe(200);
    const search = { group, from, to, duration: 60 };
    expect(await (await api(post("/openings/overlap", search, john))).json()).toEqual({ overlaps: [], suggestions: [] });
    expect((await api(post("/openings/publish", { opening: walkerOpening, audiences: [group] }, walker))).status).toBe(200);
    const result = await api(post("/openings/overlap", search, john));
    expect(result.status).toBe(200);
    const overlap = await result.json() as { overlaps: { start: string; end: string }[] };
    expect(overlap.overlaps).toHaveLength(1);
    expect(new Date(overlap.overlaps[0]!.start).getTime()).toBeGreaterThanOrEqual(new Date(at(3)).getTime() - 5_000);
    expect(overlap.overlaps[0]!.end).toBe(to);
    expect(JSON.stringify(overlap)).not.toContain("owner");
    expect(JSON.stringify(await (await api(post("/openings/mine", {}, walker))).json())).not.toContain("purpose");
    expect((await api(post("/openings/overlap", search, noah))).status).toBe(403);
    const mine = await api(post("/openings/mine", {}, walker));
    expect((await mine.json() as { openings: { opening: string }[] }).openings.map((item) => item.opening)).toEqual([walkerOpening]);
    expect((await api(post("/openings/withdraw", { opening: johnOpening }, walker))).status).toBe(403);
    expect((await api(post("/openings/publish", { opening: johnOpening, audiences: [group] }, noah))).status).toBe(403);
    expect((await api(post("/openings/revise", { opening: walkerOpening, start: at(3), end: to, audiences: [] }, walker))).status).toBe(200);
    expect(await (await api(post("/openings/overlap", search, john))).json()).toEqual({ overlaps: [], suggestions: [] });
    expect((await api(post("/openings/withdraw", { opening: walkerOpening }, walker))).status).toBe(200);
    expect(await (await api(post("/openings/overlap", search, john))).json()).toEqual({ overlaps: [], suggestions: [] });
    expect((await api(post("/groups/leave", { group }, walker))).status).toBe(200);
    expect((await api(post("/openings/overlap", search, walker))).status).toBe(403);
  });

  test("serializes concurrent writes and updates overlaps after revision or withdrawal", async () => {
    const concept = new AvailabilitySharingConcept(db);
    const first = { owner: "user-1", start: at(2), end: at(4) };
    const second = { owner: "user-1", start: at(3), end: at(5) };
    const attempts = await Promise.allSettled([concept.create(first), concept.create(second)]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected" && attempt.reason instanceof OpeningConflict)).toHaveLength(1);
    const owned = await concept._owned({ user: "user-1" });
    expect(owned).toHaveLength(1);
    const original = owned[0]!;
    await expect(concept.revise({ user: "user-1", opening: original.opening, start: original.start, end: original.end, audiences: [] })).rejects.toThrow();
    const newEnd = at(6);
    await concept.revise({ user: "user-1", opening: original.opening, start: original.start, end: newEnd, audiences: [] });
    expect((await concept._owned({ user: "user-1" }))[0]!.end).toBe(newEnd);
    await concept.withdraw({ user: "user-1", opening: original.opening });
    expect(await concept._owned({ user: "user-1" })).toEqual([]);
    await expect(concept.create({ owner: "user-1", start: at(-3), end: at(-1) })).rejects.toThrow();
  });

  test("returns the largest partial group only when no full-group time exists", async () => {
    const api = handler();
    async function account(username: string) {
      const { user } = await (await api(post("/auth/register", { username, password: "safe password" }))).json() as { user: string };
      const signedIn = await api(post("/auth/sign-in", { username, password: "safe password" }));
      return { user, cookie: signedIn.headers.get("set-cookie")!.split(";", 1)[0] };
    }
    const john = await account("john"), walker = await account("walker"), eli = await account("eli");
    const group = (await (await api(post("/groups/create", { name: "Friends" }, john.cookie))).json() as { group: string }).group;
    for (const [name, member] of [["walker", walker], ["eli", eli]] as const) {
      await api(post("/groups/invite", { group, username: name }, john.cookie));
      await api(post("/groups/accept", { group }, member.cookie));
    }
    const from = at(3), to = at(5);
    const openings = new AvailabilitySharingConcept(db);
    for (const member of [john, walker]) {
      const { opening } = await openings.create({ owner: member.user, start: from, end: to });
      await openings.publish({ user: member.user, opening, audiences: [group] });
    }
    const search = { group, from, to, duration: 60 };
    const partial = await (await api(post("/openings/overlap", search, john.cookie))).json() as { overlaps: unknown[]; suggestions: { availableCount: number; totalCount: number; unavailable: { username: string }[] }[] };
    expect(partial.overlaps).toEqual([]);
    expect(partial.suggestions).toHaveLength(1);
    expect(partial.suggestions[0]).toMatchObject({ availableCount: 2, totalCount: 3, unavailable: [{ username: "eli" }] });
    const { opening } = await openings.create({ owner: eli.user, start: from, end: to });
    await openings.publish({ user: eli.user, opening, audiences: [group] });
    const full = await (await api(post("/openings/overlap", search, john.cookie))).json() as { overlaps: unknown[]; suggestions: unknown[] };
    expect(full.overlaps).toHaveLength(1);
    expect(full.suggestions).toEqual([]);

    const snapshot = await readOverlapSnapshot(db, { user: john.user, ...search, now: new Date() }, async () => {
      await openings.withdraw({ user: eli.user, opening });
    });
    expect(snapshot.overlaps).toHaveLength(1);
    expect(snapshot.suggestions).toEqual([]);
    const after = await (await api(post("/openings/overlap", search, john.cookie))).json() as { overlaps: unknown[]; suggestions: unknown[] };
    expect(after.overlaps).toEqual([]);
    expect(after.suggestions).toHaveLength(1);
  });
});
