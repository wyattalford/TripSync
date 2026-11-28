import { MongoServerError, type Collection, type Db } from "mongodb";

export class InvalidReminder extends Error {}

type PreferenceDocument = { _id: string; leadMinutes: number; timeZone: string };
type ReminderDocument = { _id: string; user: string; gathering: string; version: string; sentAt: Date };

export const DEFAULT_LEAD_MINUTES = 60;
export const MIN_LEAD_MINUTES = 1;
export const MAX_LEAD_MINUTES = 24 * 60;
export const DEFAULT_TIME_ZONE = "America/New_York";

export function isTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isLeadMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_LEAD_MINUTES && value <= MAX_LEAD_MINUTES;
}

export class RemindingConcept {
  private readonly preferences: Collection<PreferenceDocument>;
  private readonly reminders: Collection<ReminderDocument>;

  constructor(db: Db, private readonly clock: () => Date = () => new Date()) {
    this.preferences = db.collection<PreferenceDocument>("reminding.preferences");
    this.reminders = db.collection<ReminderDocument>("reminding.reminders");
  }

  async setPreferences({ user, leadMinutes, timeZone }: { user: string; leadMinutes: number; timeZone: string }) {
    if (!isLeadMinutes(leadMinutes) || !isTimeZone(timeZone)) {
      throw new InvalidReminder("Choose a reminder time between 1 minute and 24 hours.");
    }
    await this.preferences.updateOne({ _id: user }, { $set: { leadMinutes, timeZone } }, { upsert: true });
    return {};
  }

  async record({ user, gathering, version }: { user: string; gathering: string; version: string }) {
    try {
      await this.reminders.insertOne({ _id: `${user}|${version}`, user, gathering, version, sentAt: this.clock() });
      return { first: true };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return { first: false };
      throw error;
    }
  }

  async _preferences({ user }: { user: string }) {
    const found = await this.preferences.findOne({ _id: user });
    return { leadMinutes: found?.leadMinutes ?? DEFAULT_LEAD_MINUTES, timeZone: found?.timeZone ?? DEFAULT_TIME_ZONE };
  }

  async _preferencesFor({ users }: { users: string[] }) {
    const found = new Map((await this.preferences.find({ _id: { $in: users } }).toArray()).map((item) => [item._id, item]));
    return {
      preferences: users.map((user) => ({
        user,
        leadMinutes: found.get(user)?.leadMinutes ?? DEFAULT_LEAD_MINUTES,
        timeZone: found.get(user)?.timeZone ?? DEFAULT_TIME_ZONE,
      })),
    };
  }

  async _recorded({ user, version }: { user: string; version: string }) {
    return { recorded: (await this.reminders.findOne({ _id: `${user}|${version}` }, { projection: { _id: 1 } })) !== null };
  }
}
