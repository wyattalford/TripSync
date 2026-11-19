import type { ValidationResult } from "@mit-sdg/sync-engine/boundary";

export function validateGatheringRequest(value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  for (const [key, field] of Object.entries(value)) {
    if (key === "session" && field === null) continue;
    if ((key === "invitees" || key === "expectedAttendees") && Array.isArray(field) && field.every((item) => typeof item === "string")) continue;
    if (typeof field !== "string") return { ok: false };
  }
  return { ok: true };
}
