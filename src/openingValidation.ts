import type { ValidationResult } from "@mit-sdg/sync-engine/boundary";

export function validateOpeningRequest(value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  for (const [key, field] of Object.entries(value)) {
    if (key === "session" && field === null) continue;
    if ((key === "audiences") && Array.isArray(field) && field.every((item) => typeof item === "string")) continue;
    if (key === "duration" && typeof field === "number" && Number.isFinite(field) && field > 0) continue;
    if (typeof field !== "string") return { ok: false };
  }
  return { ok: true };
}

export function validateSelectedOverlapRequest(value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || !("invitees" in value)) return { ok: false };
  const { invitees, ...search } = value;
  if (!Array.isArray(invitees) || invitees.length === 0 ||
      !invitees.every((member) => typeof member === "string" && member.trim().length > 0) ||
      new Set(invitees).size !== invitees.length) return { ok: false };
  if (!("duration" in search) || typeof search.duration !== "number") return { ok: false };
  return validateOpeningRequest(search);
}
