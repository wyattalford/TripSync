// Background coordination for reminders and email delivery (runs from src/main.ts).
//
// Reminders: for each confirmed gathering starting within the longest allowed lead time, every
// attendee whose own lead time has been reached gets one reminder per gathering version:
// always an in-app notice, plus an email when they have a verified address with email reminders on.
// Each step is idempotent (source keys and Reminding.record), so a crash or retry never duplicates.

import type { Db } from "mongodb";
import { ContactingConcept } from "./concepts/Contacting.ts";
import { GatheringConcept } from "./concepts/Gathering.ts";
import { NotifyingConcept } from "./concepts/Notifying.ts";
import { MAX_LEAD_MINUTES, RemindingConcept } from "./concepts/Reminding.ts";
import { emailLayout, type Mailer } from "./mailer.ts";

const MINUTE = 60_000;

/** "1 minute", "45 minutes", "1 hour", "1 hour 30 minutes", "24 hours". */
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const part = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (hours === 0) return part(rest, "minute");
  return rest === 0 ? part(hours, "hour") : `${part(hours, "hour")} ${part(rest, "minute")}`;
}

/** How soon something starts, for reminder wording. */
export function startsIn(start: Date, now: Date): string {
  const minutes = (start.getTime() - now.getTime()) / MINUTE;
  return minutes < 1 ? "in less than a minute" : `in ${formatDuration(minutes)}`;
}

/** "Fri, Nov 28, 7:30 PM EST" in the person's time zone. */
export function formatWhen(iso: string, timeZone: string): string {
  // Built from parts so the wording is the same on every runtime ("at" vs "," differs between ICU versions).
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.weekday}, ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`;
}

export type ReminderContent = { notice: string; subject: string; text: string; html: string };

export function reminderContent(
  { activity, place, start }: { activity: string; place: string; start: string },
  { now, timeZone, link }: { now: Date; timeZone: string; link: string },
): ReminderContent {
  const soon = startsIn(new Date(start), now);
  const when = formatWhen(start, timeZone);
  return {
    notice: `Reminder: ${activity} at ${place} starts ${soon}`,
    subject: `Reminder: ${activity} starts ${soon}`,
    text: `${activity} at ${place} starts ${soon} (${when}).\n\nView the details: ${link}`,
    html: emailLayout({ heading: `${activity} starts ${soon}`, lines: [`${when} · ${place}`], action: { label: "View gathering", url: link } }),
  };
}

type Clock = () => Date;

export async function sendDueReminders(db: Db, { now = new Date(), origin = process.env.PUBLIC_ORIGIN ?? "" }: { now?: Date; origin?: string } = {}) {
  const clock: Clock = () => now;
  const gathering = new GatheringConcept(db, clock);
  const reminding = new RemindingConcept(db, clock);
  const notifying = new NotifyingConcept(db, clock);
  const contacting = new ContactingConcept(db, clock);

  const { gatherings } = await gathering._startingBetween({ from: now, to: new Date(now.getTime() + MAX_LEAD_MINUTES * MINUTE) });
  const users = [...new Set(gatherings.flatMap((item) => item.attendees))];
  if (!users.length) return { sent: 0 };
  const preferences = new Map((await reminding._preferencesFor({ users })).preferences.map((item) => [item.user, item]));

  let sent = 0;
  for (const item of gatherings) {
    const start = new Date(item.start).getTime();
    for (const user of item.attendees) {
      const preference = preferences.get(user)!;
      if (now.getTime() < start - preference.leadMinutes * MINUTE) continue;
      if ((await reminding._recorded({ user, version: item.version })).recorded) continue;
      const destination = `/gatherings/${item.gathering}`;
      const content = reminderContent(item, { now, timeZone: preference.timeZone, link: `${origin}${destination}` });
      const sourceKey = `reminder:${item.version}`;
      await notifying.notify({ recipient: user, sourceKey, message: content.notice, destination });
      await contacting.sendToUser({ user, sourceKey, subject: content.subject, text: content.text, html: content.html });
      if ((await reminding.record({ user, gathering: item.gathering, version: item.version })).first) sent += 1;
    }
  }
  return { sent };
}

export async function deliverPendingEmails(db: Db, mailer: Mailer, { now = new Date() }: { now?: Date } = {}) {
  const contacting = new ContactingConcept(db, () => now);
  const { emails } = await contacting._pendingEmails({ now });
  let delivered = 0;
  for (const email of emails) {
    try {
      await mailer({ to: email.to, subject: email.subject, text: email.text, html: email.html });
      await contacting.markSent({ email: email.email });
      delivered += 1;
    } catch (error) {
      console.error("Email delivery will retry", error instanceof Error ? error.message : error);
      await contacting.markFailed({ email: email.email });
    }
  }
  return { delivered, attempted: emails.length };
}
