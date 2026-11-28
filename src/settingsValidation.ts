import type { ValidationResult } from "@mit-sdg/sync-engine/boundary";

// Settings requests carry a number (leadMinutes) and a flag (enabled); everything else is a string.
export function validateSettingsRequest(value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  for (const [key, field] of Object.entries(value)) {
    if (key === "session" && field === null) continue;
    if (key === "leadMinutes") { if (typeof field === "number" && Number.isFinite(field)) continue; return { ok: false }; }
    if (key === "enabled") { if (typeof field === "boolean") continue; return { ok: false }; }
    if (typeof field !== "string" || field.length > 320) return { ok: false };
  }
  return { ok: true };
}
