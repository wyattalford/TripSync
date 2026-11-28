import { describe, expect, test } from "bun:test";
import {
  LEAD_PRESETS, MAX_LEAD_MINUTES, MIN_LEAD_MINUTES, formatLead, fromMinutes, isCode, isEmailAddress, leadError, settingsError, toMinutes,
} from "../../frontend/src/settings.ts";

describe("reminder time input", () => {
  test("presets are valid lead times, ordered, and include the 1-hour default", () => {
    const minutes = LEAD_PRESETS.map((preset) => preset.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(minutes).toContain(60);
    for (const value of minutes) expect(leadError(value)).toBe("");
  });

  test("converts amounts and units to whole minutes", () => {
    expect(toMinutes(1, "minutes")).toBe(1);
    expect(toMinutes(2, "hours")).toBe(120);
    expect(toMinutes(1.5, "hours")).toBe(90);
    expect(toMinutes(1.5, "minutes")).toBeNull();
    expect(toMinutes(Number.NaN, "hours")).toBeNull();
  });

  test("shows whole hours as hours and everything else as minutes", () => {
    expect(fromMinutes(120)).toEqual({ amount: 2, unit: "hours" });
    expect(fromMinutes(90)).toEqual({ amount: 90, unit: "minutes" });
    expect(fromMinutes(1440)).toEqual({ amount: 24, unit: "hours" });
  });

  test("allows exactly 1 minute to 24 hours", () => {
    expect([MIN_LEAD_MINUTES, MAX_LEAD_MINUTES]).toEqual([1, 1440]);
    expect(leadError(1)).toBe("");
    expect(leadError(1440)).toBe("");
    expect(leadError(0)).toContain("1 minute");
    expect(leadError(1441)).toContain("24 hours");
    expect(leadError(null)).toContain("whole number");
  });

  test("describes lead times in words", () => {
    expect(formatLead(1)).toBe("1 minute");
    expect(formatLead(45)).toBe("45 minutes");
    expect(formatLead(60)).toBe("1 hour");
    expect(formatLead(150)).toBe("2 hours 30 minutes");
  });
});

describe("email form", () => {
  test("accepts ordinary addresses and rejects malformed ones", () => {
    for (const value of ["walker@example.com", " Walker@MIT.edu ", "a.b+c@sub.example.org"]) expect(isEmailAddress(value)).toBe(true);
    for (const value of ["", "walker", "walker@", "@example.com", "walker@example", "a b@example.com"]) expect(isEmailAddress(value)).toBe(false);
  });

  test("codes are exactly six digits", () => {
    expect(isCode("123456")).toBe(true);
    expect(isCode(" 012345 ")).toBe(true);
    for (const value of ["", "12345", "1234567", "12a456"]) expect(isCode(value)).toBe(false);
  });

  test("explains each server refusal for the step that failed", () => {
    expect(settingsError("request", "CONFLICT")).toContain("Wait a minute");
    expect(settingsError("request", "INVALID_REQUEST")).toContain("valid email");
    expect(settingsError("verify", "INVALID_REQUEST")).toContain("incorrect");
    expect(settingsError("verify", "NOT_FOUND")).toContain("expired");
    expect(settingsError("reminders", "INVALID_REQUEST")).toContain("between 1 minute and 24 hours");
    expect(settingsError("email", "UNAUTHORIZED")).toContain("Sign in again");
    expect(settingsError("email", "INTERNAL_ERROR")).toContain("Try again");
  });
});
