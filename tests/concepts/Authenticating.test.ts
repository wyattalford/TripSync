import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  AuthenticatingConcept, InvalidCredentials, UnknownSession, UsernameTaken,
} from "../../src/concepts/Authenticating.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required for Authenticating tests.");
const databaseName = `opentime_authenticating_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const client = new MongoClient(testUrl.toString());
let db: Db;
let now: Date;
let auth: AuthenticatingConcept;

const baseTime = Date.parse("2030-01-01T12:00:00.000Z");
const MINUTE = 60_000;
const SESSION_LIFETIME = 30 * MINUTE;
const password = "safe password";

async function resetTestDatabase() {
  if (db.databaseName !== databaseName || !databaseName.startsWith("opentime_authenticating_")) {
    throw new Error("Refusing to reset another database.");
  }
  await db.dropDatabase();
}

async function storedState() {
  return {
    users: await db.collection("authenticating.users").find().sort({ _id: 1 }).toArray(),
    sessions: await db.collection("authenticating.sessions").find().sort({ _id: 1 }).toArray(),
  };
}

async function expectUnchanged(action: () => Promise<unknown>, error: new (message?: string) => Error) {
  const before = await storedState();
  await expect(action()).rejects.toBeInstanceOf(error);
  expect(await storedState()).toEqual(before);
}

function advance(ms: number) {
  now = new Date(now.getTime() + ms);
}

describe("Authenticating", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => {
    await resetTestDatabase();
    now = new Date(baseTime);
    auth = new AuthenticatingConcept(db, () => now);
  });
  afterAll(async () => { await resetTestDatabase(); await client.close(); });

  test("principle: register, sign in, authenticate until sign-out, then the session stops working", async () => {
    const { user } = await auth.register({ username: "john", password });
    const { session, expiresAt } = await auth.signIn({ username: "john", password });
    expect(await auth.authenticate({ session })).toEqual({ user });
    advance(10 * MINUTE);
    expect(await auth.authenticate({ session })).toEqual({ user });
    expect(await auth.signOut({ session })).toEqual({});
    await expect(auth.authenticate({ session })).rejects.toBeInstanceOf(UnknownSession);
    expect(expiresAt).toEqual(new Date(baseTime + SESSION_LIFETIME));
  });

  test("register returns distinct unguessable identities and stores only a derived verifier", async () => {
    const first = await auth.register({ username: "john", password });
    const second = await auth.register({ username: "walker", password });
    expect(first.user).not.toBe(second.user);
    for (const { user } of [first, second]) expect(user).toMatch(/^[0-9a-f-]{36}$/);
    const stored = await db.collection<{ _id: string; username: string; passwordVerifier: string }>("authenticating.users")
      .findOne({ _id: first.user });
    expect(stored?.username).toBe("john");
    expect(stored?.passwordVerifier).not.toContain(password);
    expect(stored?.passwordVerifier.startsWith("$argon2id$")).toBe(true);
    expect(await Bun.password.verify(password, stored!.passwordVerifier)).toBe(true);
    const otherStored = await db.collection<{ _id: string; passwordVerifier: string }>("authenticating.users")
      .findOne({ _id: second.user });
    expect(otherStored?.passwordVerifier).not.toBe(stored?.passwordVerifier);
  });

  test("register refuses blank usernames or passwords without changing state", async () => {
    await auth.register({ username: "john", password });
    for (const [username, pass] of [["", password], ["   ", password], ["eli", ""], ["eli", "   "], ["", ""]]) {
      await expectUnchanged(() => auth.register({ username: username!, password: pass! }), InvalidCredentials);
    }
  });

  test("register refuses passwords shorter than 8 characters and accepts exactly 8", async () => {
    for (const pass of ["a", "1234567", "short", "      x"]) {
      await expectUnchanged(() => auth.register({ username: "eli", password: pass }), InvalidCredentials);
    }
    const { user } = await auth.register({ username: "eli", password: "12345678" });
    expect(await auth._byUsername({ username: "eli" })).toEqual([{ user }]);
  });

  test("usernames are trimmed and case-insensitive for register, signIn, and _byUsername", async () => {
    const { user } = await auth.register({ username: "  John ", password });
    expect(await auth._username({ user })).toEqual([{ username: "john" }]);
    for (const username of ["john", "JOHN", " John  ", "jOhN"]) {
      await expectUnchanged(() => auth.register({ username, password }), UsernameTaken);
      expect(await auth._byUsername({ username })).toEqual([{ user }]);
      const { session } = await auth.signIn({ username, password });
      expect(await auth.authenticate({ session })).toEqual({ user });
    }
    expect(await db.collection("authenticating.users").countDocuments()).toBe(1);
  });

  test("register refuses a taken username, even with a different password, without changing state", async () => {
    await auth.register({ username: "eli", password });
    await expectUnchanged(() => auth.register({ username: "eli", password: "another password" }), UsernameTaken);
    await expectUnchanged(() => auth.register({ username: "eli", password }), UsernameTaken);
    expect(await auth._byUsername({ username: "eli" })).toHaveLength(1);
  });

  test("concurrent registrations of one username admit exactly one account", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) => auth.register({ username: "noah", password: `password ${index}` })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof UsernameTaken)).toHaveLength(4);
    expect(await db.collection("authenticating.users").countDocuments({ username: "noah" })).toBe(1);
  });

  test("signIn refuses unknown users and wrong passwords identically without creating sessions", async () => {
    await auth.register({ username: "john", password });
    const attempts = [
      { username: "john", password: "wrong password" },
      { username: "john", password: "" },
      { username: "john", password: "Safe password" },
      { username: "john", password: ` ${password}` },
      { username: "nobody", password },
      { username: "", password },
    ];
    const messages = new Set<string>();
    for (const attempt of attempts) {
      const before = await storedState();
      const error = await auth.signIn(attempt).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(InvalidCredentials);
      messages.add((error as Error).message);
      expect(await storedState()).toEqual(before);
    }
    expect([...messages]).toEqual(["The username or password is incorrect."]);
  });

  test("each sign-in issues a distinct session expiring 30 minutes after that sign-in", async () => {
    const { user } = await auth.register({ username: "john", password });
    const first = await auth.signIn({ username: "john", password });
    advance(5 * MINUTE);
    const second = await auth.signIn({ username: "john", password });
    expect(first.session).not.toBe(second.session);
    for (const { session } of [first, second]) expect(session).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.expiresAt).toEqual(new Date(baseTime + SESSION_LIFETIME));
    expect(second.expiresAt).toEqual(new Date(baseTime + 5 * MINUTE + SESSION_LIFETIME));
    expect(await auth.authenticate({ session: first.session })).toEqual({ user });
    expect(await auth.authenticate({ session: second.session })).toEqual({ user });
  });

  test("sessions identify only their own user", async () => {
    const john = await auth.register({ username: "john", password });
    const eli = await auth.register({ username: "eli", password });
    const johnSession = await auth.signIn({ username: "john", password });
    const eliSession = await auth.signIn({ username: "eli", password });
    expect(await auth.authenticate({ session: johnSession.session })).toEqual({ user: john.user });
    expect(await auth.authenticate({ session: eliSession.session })).toEqual({ user: eli.user });
  });

  test("authenticate refuses unknown and malformed sessions", async () => {
    await auth.register({ username: "john", password });
    await auth.signIn({ username: "john", password });
    for (const session of ["", "made-up-session", crypto.randomUUID()]) {
      await expectUnchanged(() => auth.authenticate({ session }), UnknownSession);
    }
  });

  test("a session is valid until just before its deadline and expired exactly at it", async () => {
    const { user } = await auth.register({ username: "walker", password });
    const { session } = await auth.signIn({ username: "walker", password });
    advance(SESSION_LIFETIME - 1);
    expect(await auth.authenticate({ session })).toEqual({ user });
    advance(1);
    await expect(auth.authenticate({ session })).rejects.toBeInstanceOf(UnknownSession);
  });

  test("authenticating an expired session removes it; signing in again restores access", async () => {
    const { user } = await auth.register({ username: "walker", password });
    const { session } = await auth.signIn({ username: "walker", password });
    advance(SESSION_LIFETIME + MINUTE);
    await expect(auth.authenticate({ session })).rejects.toBeInstanceOf(UnknownSession);
    expect(await db.collection("authenticating.sessions").countDocuments({ _id: session as never })).toBe(0);
    await expect(auth.signOut({ session })).rejects.toBeInstanceOf(UnknownSession);
    const renewed = await auth.signIn({ username: "walker", password });
    expect(await auth.authenticate({ session: renewed.session })).toEqual({ user });
  });

  test("signOut revokes only the given session", async () => {
    const { user } = await auth.register({ username: "john", password });
    const laptop = await auth.signIn({ username: "john", password });
    const phone = await auth.signIn({ username: "john", password });
    await auth.signOut({ session: laptop.session });
    await expect(auth.authenticate({ session: laptop.session })).rejects.toBeInstanceOf(UnknownSession);
    expect(await auth.authenticate({ session: phone.session })).toEqual({ user });
  });

  test("signOut refuses unknown, already revoked, and expired sessions", async () => {
    await auth.register({ username: "john", password });
    const { session } = await auth.signIn({ username: "john", password });
    await expectUnchanged(() => auth.signOut({ session: "made-up-session" }), UnknownSession);
    await auth.signOut({ session });
    await expectUnchanged(() => auth.signOut({ session }), UnknownSession);
    const expiring = await auth.signIn({ username: "john", password });
    advance(SESSION_LIFETIME);
    await expect(auth.signOut({ session: expiring.session })).rejects.toBeInstanceOf(UnknownSession);
    expect(await db.collection("authenticating.sessions").countDocuments()).toBe(0);
  });

  test("signing out does not affect the account, which can sign in again", async () => {
    const { user } = await auth.register({ username: "john", password });
    const { session } = await auth.signIn({ username: "john", password });
    await auth.signOut({ session });
    expect(await auth._exists({ user })).toEqual([{ exists: true }]);
    const again = await auth.signIn({ username: "john", password });
    expect(again.session).not.toBe(session);
    expect(await auth.authenticate({ session: again.session })).toEqual({ user });
  });

  test("the session store is indexed so expired sessions are purged automatically", async () => {
    await auth.register({ username: "john", password });
    await auth.signIn({ username: "john", password });
    const sessionIndexes = await db.collection("authenticating.sessions").indexes();
    expect(sessionIndexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
    const userIndexes = await db.collection("authenticating.users").indexes();
    expect(userIndexes.some((index) => index.key.username === 1 && index.unique === true)).toBe(true);
  });

  test("_exists, _byUsername, and _username answer for registered users and give no rows otherwise", async () => {
    const { user } = await auth.register({ username: "john", password });
    expect(await auth._exists({ user })).toEqual([{ exists: true }]);
    expect(await auth._exists({ user: "missing" })).toEqual([{ exists: false }]);
    expect(await auth._byUsername({ username: "john" })).toEqual([{ user }]);
    expect(await auth._byUsername({ username: "nobody" })).toEqual([]);
    expect(await auth._username({ user })).toEqual([{ username: "john" }]);
    expect(await auth._username({ user: "missing" })).toEqual([]);
  });

  test("_usernames labels only the supplied registered users", async () => {
    const john = await auth.register({ username: "john", password });
    const eli = await auth.register({ username: "eli", password });
    await auth.register({ username: "walker", password });
    const { accounts } = await auth._usernames({ users: [john.user, eli.user, "missing"] });
    expect(accounts.sort((a, b) => a.username.localeCompare(b.username))).toEqual([
      { user: eli.user, username: "eli" },
      { user: john.user, username: "john" },
    ]);
    expect(await auth._usernames({ users: [] })).toEqual({ accounts: [] });
  });

  test("queries never expose password verifiers or sessions", async () => {
    const { user } = await auth.register({ username: "john", password });
    await auth.signIn({ username: "john", password });
    const results = JSON.stringify([
      await auth._exists({ user }), await auth._byUsername({ username: "john" }),
      await auth._username({ user }), await auth._usernames({ users: [user] }),
    ]);
    expect(results).not.toContain("argon2");
    expect(results).not.toContain("passwordVerifier");
    expect(results).not.toContain("session");
  });
});
