// Pure helpers for the settings page: reminder lead time conversion, validation, and error wording.

export const MIN_LEAD_MINUTES = 1;
export const MAX_LEAD_MINUTES = 24 * 60;
export const DEFAULT_LEAD_MINUTES = 60;

export type LeadUnit = "minutes" | "hours";

export const LEAD_PRESETS: readonly { minutes: number; label: string }[] = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 24 * 60, label: "1 day" },
];

/** Converts an amount and unit to whole minutes, or null when it is not a whole number of minutes. */
export function toMinutes(amount: number, unit: LeadUnit): number | null {
  if (!Number.isFinite(amount)) return null;
  const minutes = unit === "hours" ? amount * 60 : amount;
  return Number.isInteger(minutes) ? minutes : null;
}

/** Shows whole hours as hours, everything else as minutes. */
export function fromMinutes(minutes: number): { amount: number; unit: LeadUnit } {
  return minutes % 60 === 0 ? { amount: minutes / 60, unit: "hours" } : { amount: minutes, unit: "minutes" };
}

export function leadError(minutes: number | null): string {
  if (minutes === null) return "Enter a whole number of minutes.";
  if (minutes < MIN_LEAD_MINUTES) return "The shortest reminder time is 1 minute.";
  if (minutes > MAX_LEAD_MINUTES) return "The longest reminder time is 24 hours.";
  return "";
}

/** "1 minute", "45 minutes", "1 hour", "1 hour 30 minutes", "24 hours". */
export function formatLead(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (hours === 0) return part(rest, "minute");
  return rest === 0 ? part(hours, "hour") : `${part(hours, "hour")} ${part(rest, "minute")}`;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function isEmailAddress(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

/** Wording for public API errors from the settings endpoints, by step. */
export function settingsError(step: "reminders" | "request" | "verify" | "email", error: string): string {
  if (error === "UNAUTHORIZED") return "Your session ended. Sign in again.";
  if (error === "NETWORK_ERROR") return "OpenTime could not reach the server. Check your connection and try again.";
  if (step === "reminders" && error === "INVALID_REQUEST") return "Choose a reminder time between 1 minute and 24 hours.";
  if (step === "request" && error === "INVALID_REQUEST") return "Enter a valid email address.";
  if (step === "request" && error === "CONFLICT") return "A code was just sent. Wait a minute before requesting another.";
  if (step === "verify" && error === "INVALID_REQUEST") return "That code is incorrect. Check the email and try again.";
  if (step === "verify" && error === "NOT_FOUND") return "That code has expired. Send a new one.";
  return "OpenTime could not save that change. Try again.";
}
