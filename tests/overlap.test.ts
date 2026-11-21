import { describe, expect, test } from "bun:test";
import { availabilityCalendar, bestPartialGroupTimes, fullGroupOverlaps } from "../src/overlap.ts";

describe("aggregate availability calendar", () => {
  test("counts current members, combines adjacent openings, and subtracts commitments", () => {
    const result = availabilityCalendar({
      members: ["a", "b", "c", "a"],
      openings: [
        { owner: "a", start: "2035-01-01T09:00:00Z", end: "2035-01-01T10:00:00Z" },
        { owner: "a", start: "2035-01-01T10:00:00Z", end: "2035-01-01T12:00:00Z" },
        { owner: "b", start: "2035-01-01T09:30:00Z", end: "2035-01-01T11:30:00Z" },
        { owner: "former", start: "2035-01-01T09:00:00Z", end: "2035-01-01T12:00:00Z" },
      ],
      commitments: [{ owner: "b", start: "2035-01-01T10:00:00Z", end: "2035-01-01T10:30:00Z" }],
      from: "2035-01-01T08:00:00Z", to: "2035-01-01T12:00:00Z",
      now: "2035-01-01T08:30:00Z", durationMinutes: 60,
    });
    expect(result.total).toBe(3);
    expect(result.timeline).toEqual([
      { start: "2035-01-01T08:30:00.000Z", end: "2035-01-01T09:00:00.000Z", availableCount: 0 },
      { start: "2035-01-01T09:00:00.000Z", end: "2035-01-01T09:30:00.000Z", availableCount: 1 },
      { start: "2035-01-01T09:30:00.000Z", end: "2035-01-01T10:00:00.000Z", availableCount: 2 },
      { start: "2035-01-01T10:00:00.000Z", end: "2035-01-01T10:30:00.000Z", availableCount: 1 },
      { start: "2035-01-01T10:30:00.000Z", end: "2035-01-01T11:30:00.000Z", availableCount: 2 },
      { start: "2035-01-01T11:30:00.000Z", end: "2035-01-01T12:00:00.000Z", availableCount: 1 },
    ]);
    expect(result.windows).toContainEqual({ start: "2035-01-01T09:00:00.000Z", end: "2035-01-01T12:00:00.000Z", availableCount: 1 });
    expect(result.windows).toContainEqual({ start: "2035-01-01T10:30:00.000Z", end: "2035-01-01T11:30:00.000Z", availableCount: 2 });
    expect(result.windows.some((item) => item.availableCount === 2 && item.start < "2035-01-01T10:30")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("former");
  });

  test("does not treat a changing set of members as a single qualifying window", () => {
    const result = availabilityCalendar({
      members: ["a", "b", "c"],
      openings: [
        { owner: "a", start: "2035-01-01T09:00:00Z", end: "2035-01-01T11:00:00Z" },
        { owner: "b", start: "2035-01-01T09:00:00Z", end: "2035-01-01T10:00:00Z" },
        { owner: "c", start: "2035-01-01T10:00:00Z", end: "2035-01-01T11:00:00Z" },
      ],
      commitments: [], from: "2035-01-01T09:00:00Z", to: "2035-01-01T11:00:00Z",
      now: "2035-01-01T08:00:00Z", durationMinutes: 90,
    });
    expect(result.timeline).toEqual([{ start: "2035-01-01T09:00:00.000Z", end: "2035-01-01T11:00:00.000Z", availableCount: 2 }]);
    expect(result.windows).toEqual([{ start: "2035-01-01T09:00:00.000Z", end: "2035-01-01T11:00:00.000Z", availableCount: 1 }]);
  });
});

describe("full-group overlap calculation", () => {
  test("combines adjacent openings and requires every member", () => {
    const result = fullGroupOverlaps({
      members: ["john", "walker", "eli"],
      openings: [
        { owner: "john", start: "2026-11-20T19:00:00Z", end: "2026-11-20T20:00:00Z" },
        { owner: "john", start: "2026-11-20T20:00:00Z", end: "2026-11-20T22:00:00Z" },
        { owner: "walker", start: "2026-11-20T19:00:00Z", end: "2026-11-20T22:00:00Z" },
        { owner: "eli", start: "2026-11-20T19:30:00Z", end: "2026-11-20T21:00:00Z" },
      ],
      commitments: [],
      from: "2026-11-20T18:00:00Z", to: "2026-11-20T23:00:00Z", now: "2026-11-20T12:00:00Z", durationMinutes: 90,
    });
    expect(result).toEqual([{ start: "2026-11-20T19:30:00.000Z", end: "2026-11-20T21:00:00.000Z" }]);
    expect(fullGroupOverlaps({ members: ["john", "walker", "eli", "noah"], openings: [], commitments: [], from: "2026-11-20T18:00:00Z", to: "2026-11-20T23:00:00Z", now: "2026-11-20T12:00:00Z", durationMinutes: 1 })).toEqual([]);
  });

  test("clips past time and removes confirmed commitments without exposing them", () => {
    const result = fullGroupOverlaps({
      members: ["john", "walker"],
      openings: [
        { owner: "john", start: "2026-11-20T18:00:00Z", end: "2026-11-20T22:00:00Z" },
        { owner: "walker", start: "2026-11-20T18:00:00Z", end: "2026-11-20T22:00:00Z" },
      ],
      commitments: [{ owner: "john", start: "2026-11-20T20:00:00Z", end: "2026-11-20T21:00:00Z" }],
      from: "2026-11-20T18:00:00Z", to: "2026-11-20T22:00:00Z", now: "2026-11-20T19:00:00Z", durationMinutes: 60,
    });
    expect(result).toEqual([
      { start: "2026-11-20T19:00:00.000Z", end: "2026-11-20T20:00:00.000Z" },
      { start: "2026-11-20T21:00:00.000Z", end: "2026-11-20T22:00:00.000Z" },
    ]);
  });

  test("suggests only intervals with the highest available count and respects commitments", () => {
    const result = bestPartialGroupTimes({
      members: ["john", "walker", "eli", "noah"],
      openings: [
        { owner: "john", start: "2026-11-20T18:00:00Z", end: "2026-11-20T22:00:00Z" },
        { owner: "walker", start: "2026-11-20T18:00:00Z", end: "2026-11-20T22:00:00Z" },
        { owner: "eli", start: "2026-11-20T19:00:00Z", end: "2026-11-20T21:00:00Z" },
        { owner: "noah", start: "2026-11-20T21:00:00Z", end: "2026-11-20T22:00:00Z" },
      ],
      commitments: [{ owner: "eli", start: "2026-11-20T20:00:00Z", end: "2026-11-20T21:00:00Z" }],
      from: "2026-11-20T18:00:00Z", to: "2026-11-20T22:00:00Z", now: "2026-11-20T12:00:00Z", durationMinutes: 60,
    });
    expect(result.map(({ start, end, availableCount, unavailable }) => ({ start, end, availableCount, unavailable }))).toEqual([
      { start: "2026-11-20T19:00:00.000Z", end: "2026-11-20T20:00:00.000Z", availableCount: 3, unavailable: ["noah"] },
      { start: "2026-11-20T21:00:00.000Z", end: "2026-11-20T22:00:00.000Z", availableCount: 3, unavailable: ["eli"] },
    ]);
  });

  test("a brief third opening does not break a longer valid partial time", () => {
    const result = bestPartialGroupTimes({
      members: ["john", "walker", "eli"],
      openings: [
        { owner: "john", start: "2026-11-20T18:00:00Z", end: "2026-11-20T20:00:00Z" },
        { owner: "walker", start: "2026-11-20T18:00:00Z", end: "2026-11-20T20:00:00Z" },
        { owner: "eli", start: "2026-11-20T18:45:00Z", end: "2026-11-20T19:15:00Z" },
      ],
      commitments: [], from: "2026-11-20T18:00:00Z", to: "2026-11-20T20:00:00Z",
      now: "2026-11-20T12:00:00Z", durationMinutes: 60,
    });
    expect(result).toEqual([{ start: "2026-11-20T18:00:00.000Z", end: "2026-11-20T20:00:00.000Z",
      available: ["john", "walker"], unavailable: ["eli"], availableCount: 2, totalCount: 3 }]);
  });
});
