import { MongoServerError, type ClientSession, type Collection, type Db } from "mongodb";

export class InvalidCredentials extends Error {}
export class UsernameTaken extends Error {}
export class UnknownSession extends Error {}

type UserDocument = {
  _id: string;
  username: string;
  passwordVerifier: string;
};

type SessionDocument = {
  _id: string;
  user: string;
  expiresAt: Date;
};

export async function readUsernames(db: Db, users: string[], session?: ClientSession) {
  const accounts = await db.collection<UserDocument>("authenticating.users")
    .find({ _id: { $in: users } }, { projection: { _id: 1, username: 1 }, session }).toArray();
  return new Map(accounts.map((account) => [account._id, account.username]));
}

const SESSION_LIFETIME_MS = 30 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

/** Usernames are case-insensitive and ignore surrounding whitespace. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

async function ensureIndexes(
  users: Collection<UserDocument>,
  sessions: Collection<SessionDocument>,
): Promise<void> {
  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export class AuthenticatingConcept {
  private readonly users: Collection<UserDocument>;
  private readonly sessions: Collection<SessionDocument>;
  constructor(db: Db, private readonly clock: () => Date = () => new Date()) {
    this.users = db.collection<UserDocument>("authenticating.users");
    this.sessions = db.collection<SessionDocument>("authenticating.sessions");
  }

  async register({ username: requested, password }: { username: string; password: string }) {
    const username = normalizeUsername(requested);
    if (username === "" || password.trim() === "" || password.length < MIN_PASSWORD_LENGTH) {
      throw new InvalidCredentials("Enter a username and a password of at least 8 characters.");
    }
    await ensureIndexes(this.users, this.sessions);
    const user = crypto.randomUUID();
    const passwordVerifier = await Bun.password.hash(password, { algorithm: "argon2id" });
    try {
      await this.users.insertOne({ _id: user, username, passwordVerifier });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        throw new UsernameTaken("That username is already registered.");
      }
      throw error;
    }
    return { user };
  }

  async signIn({ username, password }: { username: string; password: string }) {
    const account = await this.users.findOne({ username: normalizeUsername(username) });
    if (!account || !(await Bun.password.verify(password, account.passwordVerifier))) {
      throw new InvalidCredentials("The username or password is incorrect.");
    }
    await ensureIndexes(this.users, this.sessions);
    const expiresAt = new Date(this.clock().getTime() + SESSION_LIFETIME_MS);
    const session = crypto.randomUUID();
    await this.sessions.insertOne({ _id: session, user: account._id, expiresAt });
    return { session, expiresAt };
  }

  async authenticate({ session }: { session: string }) {
    const active = await this.sessions.findOne({ _id: session });
    if (!active) throw new UnknownSession("This session is not active.");
    if (active.expiresAt.getTime() <= this.clock().getTime()) {
      await this.sessions.deleteOne({ _id: session });
      throw new UnknownSession("This session is not active.");
    }
    return { user: active.user };
  }

  async signOut({ session }: { session: string }) {
    const active = await this.sessions.findOneAndDelete({ _id: session });
    if (!active || active.expiresAt.getTime() <= this.clock().getTime()) {
      throw new UnknownSession("This session is not active.");
    }
    return {};
  }

  async _exists({ user }: { user: string }) {
    return [{ exists: (await this.users.findOne({ _id: user }, { projection: { _id: 1 } })) !== null }];
  }

  async _byUsername({ username }: { username: string }) {
    const account = await this.users.findOne({ username: normalizeUsername(username) }, { projection: { _id: 1 } });
    return account ? [{ user: account._id }] : [];
  }

  async _username({ user }: { user: string }) {
    const account = await this.users.findOne({ _id: user }, { projection: { username: 1 } });
    return account ? [{ username: account.username }] : [];
  }

  async _usernames({ users }: { users: string[] }) {
    const accounts = await this.users.find({ _id: { $in: users } }, { projection: { _id: 1, username: 1 } }).toArray();
    return { accounts: accounts.map((account) => ({ user: account._id, username: account.username })) };
  }
}
