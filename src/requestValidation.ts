import type { ValidationResult } from "@mit-sdg/sync-engine/boundary";

export function validateAuthRequest(value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  for (const [key, field] of Object.entries(value)) {
    if (key === "session" && field === null) continue;
    if (typeof field !== "string") return { ok: false };
  }
  return { ok: true };
}
