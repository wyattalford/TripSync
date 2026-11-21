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

export function validateCalendarRequest(value: unknown): ValidationResult {
  const validated = validateOpeningRequest(value);
  if (!validated.ok || value === null || typeof value !== "object") return { ok: false };
  const request = value as Record<string, unknown>;
  if (typeof request.group !== "string" || !request.group
    || typeof request.duration !== "number" || !Number.isFinite(request.duration) || request.duration <= 0
    || typeof request.from !== "string" || typeof request.to !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(request.from)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(request.to)
    || !Number.isFinite(Date.parse(request.from)) || !Number.isFinite(Date.parse(request.to))
    || Date.parse(request.from) >= Date.parse(request.to)) return { ok: false };
  return validated;
}
