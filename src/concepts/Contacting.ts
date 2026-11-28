import { MongoServerError, type Collection, type Db } from "mongodb";
import { emailLayout } from "../mailer.ts";

export class InvalidEmail extends Error {}
export class CodeCooldown extends Error {}
export class CodeExpired extends Error {}
export class InvalidCode extends Error {}

type ContactDocument = {
  _id: string; // user
  email?: string;
  pendingEmail?: string;
  codeVerifier?: string;
  codeExpiresAt?: Date;
  codeAttempts: number;
  codeSentAt?: Date;
  emailReminders: boolean;
};

type EmailDocument = {
  _id: string;
  user: string;
  sourceKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  createdAt: Date;
  sentAt?: Date;
  attempts: number;
  nextAttemptAt: Date;
};

export const CODE_LIFETIME_MS = 15 * 60_000;
export const CODE_COOLDOWN_MS = 60_000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_SEND_ATTEMPTS = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAddress(email: string): boolean {
  return email.length <= 254 && EMAIL.test(email);
}

function verifierFor(user: string, code: string): string {
  return new Bun.CryptoHasher("sha256").update(`${user}:${code}`).digest("hex");
}

function newCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
}

async function readContact(contacts: Collection<ContactDocument>, user: string): Promise<ContactDocument> {
  return (await contacts.findOne({ _id: user })) ?? { _id: user, codeAttempts: 0, emailReminders: true };
}

type Queued = { user: string; sourceKey: string; to: string; subject: string; text: string; html: string };

/** Queues an email once per user and source key. */
async function queueEmail(emails: Collection<EmailDocument>, now: Date, item: Queued) {
  await emails.createIndex({ user: 1, sourceKey: 1 }, { unique: true });
  try {
    await emails.updateOne(
      { user: item.user, sourceKey: item.sourceKey },
      { $setOnInsert: { _id: crypto.randomUUID(), ...item, createdAt: now, attempts: 0, nextAttemptAt: now } },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11_000)) throw error;
  }
}

export class ContactingConcept {
  private readonly contacts: Collection<ContactDocument>;
  private readonly emails: Collection<EmailDocument>;

  constructor(db: Db, private readonly clock: () => Date = () => new Date()) {
    this.contacts = db.collection<ContactDocument>("contacting.contacts");
    this.emails = db.collection<EmailDocument>("contacting.emails");
  }

  async requestVerification({ user, email: requested }: { user: string; email: string }) {
    const email = normalizeEmail(requested);
    if (!isEmailAddress(email)) throw new InvalidEmail("Enter a valid email address.");
    const now = this.clock();
    const existing = await readContact(this.contacts, user);
    if (existing.codeSentAt && now.getTime() - existing.codeSentAt.getTime() < CODE_COOLDOWN_MS) {
      throw new CodeCooldown("Wait a minute before requesting another code.");
    }
    const code = newCode();
    // Conditional write so two simultaneous requests cannot both pass the cooldown.
    const cooldownOk = existing.codeSentAt ? { codeSentAt: existing.codeSentAt } : { codeSentAt: { $exists: false } };
    const changed = await this.contacts.updateOne(
      { _id: user, ...cooldownOk },
      {
        $set: { pendingEmail: email, codeVerifier: verifierFor(user, code), codeExpiresAt: new Date(now.getTime() + CODE_LIFETIME_MS), codeAttempts: 0, codeSentAt: now },
        $setOnInsert: { emailReminders: true },
      },
      { upsert: !existing.codeSentAt },
    ).catch((error: unknown) => {
      if (error instanceof MongoServerError && error.code === 11_000) return { matchedCount: 0, upsertedCount: 0 };
      throw error;
    });
    if (!changed.matchedCount && !changed.upsertedCount) throw new CodeCooldown("Wait a minute before requesting another code.");
    await queueEmail(this.emails, now, {
      user, sourceKey: `verify:${now.getTime()}`, to: email, subject: `Your OpenTime code: ${code}`,
      text: `Your OpenTime verification code is ${code}. It expires in 15 minutes. If you did not request it, you can ignore this email.`,
      html: emailLayout({ heading: `Your code is ${code}`, lines: ["Enter this code in OpenTime settings to confirm your email address.", "It expires in 15 minutes. If you did not request it, you can ignore this email."] }),
    });
    return {};
  }

  async verify({ user, code }: { user: string; code: string }) {
    const now = this.clock();
    const existing = await readContact(this.contacts, user);
    if (!existing.pendingEmail || !existing.codeVerifier || !existing.codeExpiresAt
      || existing.codeExpiresAt.getTime() <= now.getTime() || existing.codeAttempts >= MAX_CODE_ATTEMPTS) {
      throw new CodeExpired("That code has expired. Request a new one.");
    }
    if (verifierFor(user, code.trim()) !== existing.codeVerifier) {
      await this.contacts.updateOne({ _id: user, codeVerifier: existing.codeVerifier }, { $inc: { codeAttempts: 1 } });
      throw new InvalidCode("That code is incorrect.");
    }
    const changed = await this.contacts.updateOne(
      { _id: user, codeVerifier: existing.codeVerifier },
      { $set: { email: existing.pendingEmail, codeAttempts: 0 }, $unset: { pendingEmail: "", codeVerifier: "", codeExpiresAt: "" } },
    );
    if (!changed.modifiedCount) throw new CodeExpired("That code has expired. Request a new one.");
    return { email: existing.pendingEmail };
  }

  async removeEmail({ user }: { user: string }) {
    await this.contacts.updateOne({ _id: user }, { $unset: { email: "", pendingEmail: "", codeVerifier: "", codeExpiresAt: "" }, $set: { codeAttempts: 0 } });
    return {};
  }

  async setEmailReminders({ user, enabled }: { user: string; enabled: boolean }) {
    await this.contacts.updateOne({ _id: user }, { $set: { emailReminders: enabled }, $setOnInsert: { codeAttempts: 0 } }, { upsert: true });
    return {};
  }

  async sendToUser({ user, sourceKey, subject, text, html }: { user: string; sourceKey: string; subject: string; text: string; html: string }) {
    const existing = await readContact(this.contacts, user);
    if (!existing.email || !existing.emailReminders) return { queued: false };
    await queueEmail(this.emails, this.clock(), { user, sourceKey, to: existing.email, subject, text, html });
    return { queued: true };
  }

  async markSent({ email }: { email: string }) {
    await this.emails.updateOne({ _id: email, sentAt: { $exists: false } }, { $set: { sentAt: this.clock() } });
    return {};
  }

  async markFailed({ email }: { email: string }) {
    const found = await this.emails.findOne({ _id: email });
    if (!found) return {};
    const attempts = found.attempts + 1;
    const delay = Math.min(60, 2 ** attempts) * 60_000; // 2, 4, 8, 16, 32 minutes
    await this.emails.updateOne({ _id: email }, { $set: { attempts, nextAttemptAt: new Date(this.clock().getTime() + delay) } });
    return {};
  }

  async _contact({ user }: { user: string }) {
    const found = await readContact(this.contacts, user);
    return { contact: { email: found.email ?? "", pendingEmail: found.pendingEmail ?? "", emailReminders: found.emailReminders } };
  }

  async _pendingEmails({ now }: { now: Date }) {
    const found = await this.emails.find({ sentAt: { $exists: false }, attempts: { $lt: MAX_SEND_ATTEMPTS }, nextAttemptAt: { $lte: now } })
      .sort({ createdAt: 1 }).limit(25).toArray();
    return { emails: found.map((item) => ({ email: item._id, to: item.to, subject: item.subject, text: item.text, html: item.html })) };
  }
}
