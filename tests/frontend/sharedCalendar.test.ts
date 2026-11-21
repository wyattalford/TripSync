import { describe, expect, test } from "bun:test";
import { availabilityCalendar } from "../../src/overlap.ts";
import { sharedDaySegments, sharedDetails } from "../../frontend/src/sharedCalendar.ts";

describe("shared calendar filters", () => {
  const day = new Date(2035, 0, 1);
  const at = (hours: number, minutes = 0) => new Date(2035, 0, 1, hours, minutes).toISOString();
  const base = {
    members: ["a", "b", "c"],
    openings: [
      { owner: "a", start: at(9), end: at(11) },
      { owner: "b", start: at(9), end: at(10) },
      { owner: "c", start: at(10), end: at(11) },
    ],
    commitments: [], from: at(0), to: at(23), now: at(0),
  };
  const options = { from: -Infinity, to: Infinity, everyone: false };

  test("duration requires the same people rather than just the same count", () => {
    const data = availabilityCalendar({ ...base, durationMinutes: 90 });
    const segments = sharedDaySegments(data, day, { ...options, duration: 90 });
    expect(segments.find((item) => item.start === Date.parse(at(9)))?.muted).toBe(true);
    expect(segments.find((item) => item.start === Date.parse(at(9)))?.proposal).toBeNull();
    const hour = availabilityCalendar({ ...base, durationMinutes: 60 });
    const valid = sharedDaySegments(hour, day, { ...options, duration: 60 });
    expect(valid.find((item) => item.start === Date.parse(at(9)))?.proposal).toMatchObject({ start: at(9), end: at(10), availableCount: 2 });
    expect(valid.find((item) => item.start === Date.parse(at(10)))?.proposal).toMatchObject({ start: at(10), end: at(11), availableCount: 2 });
  });

  test("clips windows to the scope before testing duration and mutes partial groups", () => {
    const data = availabilityCalendar({ ...base, durationMinutes: 60 });
    const scoped = sharedDaySegments(data, day, { from: Date.parse(at(9, 30)), to: Date.parse(at(10, 30)), duration: 60, everyone: false });
    expect(scoped.filter((item) => item.start >= Date.parse(at(9)) && item.end <= Date.parse(at(11))).every((item) => item.muted)).toBe(true);
    const everyone = sharedDaySegments(data, day, { ...options, duration: null, everyone: true });
    expect(everyone.find((item) => item.start === Date.parse(at(9)))?.muted).toBe(true);
    const visible = sharedDaySegments(data, day, { ...options, duration: null });
    expect(visible.find((item) => item.start === Date.parse(at(9)))?.muted).toBe(false);
  });

  test("rounds proposal times inward rather than proposing outside the available window", () => {
    const start = new Date(Date.parse(at(9)) + 35_000).toISOString();
    const end = new Date(Date.parse(at(10)) + 25_000).toISOString();
    const interval = { start, end, availableCount: 2 };
    const data = { total: 2, timeline: [interval], windows: [interval] };
    const segments = sharedDaySegments(data, day, { ...options, duration: null });
    expect(segments.find((item) => item.start === Date.parse(start))?.proposal).toEqual({
      start: at(9, 1), end: at(10), availableCount: 2,
    });
  });

  test("does not propose ambiguous repeated local times", () => {
    const day = new Date(2030, 10, 3);
    if (new Date(2030, 10, 3, 0).getTimezoneOffset() === new Date(2030, 10, 3, 3).getTimezoneOffset()) return;
    const interval = { start: "2030-11-03T05:30:00.000Z", end: "2030-11-03T06:30:00.000Z", availableCount: 2 };
    const segments = sharedDaySegments({ total: 2, timeline: [interval], windows: [interval] }, day, { ...options, duration: null });
    const repeated = segments.find((item) => item.start === Date.parse(interval.start));
    expect(repeated).toMatchObject({ startMinute: 60, endMinute: 120, proposal: null });
  });

  test("shows the full count interval even when filters divide its display, without inventing past data", () => {
    const data = availabilityCalendar({ ...base, durationMinutes: 60, now: at(8) });
    const segments = sharedDaySegments(data, day, { from: Date.parse(at(9, 30)), to: Date.parse(at(10, 30)), duration: 60, everyone: false });
    const filtered = segments.find((item) => item.start === Date.parse(at(9, 30)))!;
    expect(sharedDetails(data, filtered)).toMatchObject({
      start: Date.parse(at(9)), end: Date.parse(at(11)), count: 2, muted: true, proposal: null,
    });
    const empty = segments.find((item) => item.start === Date.parse(at(8)))!;
    expect(sharedDetails(data, empty)).toMatchObject({ count: 0 });
    const past = segments.find((item) => item.start === Date.parse(at(0)))!;
    expect(sharedDetails(data, past)).toMatchObject({ count: null, muted: true });
  });
});
