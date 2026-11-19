import { describe, expect, test } from "bun:test";
import { fullGroupOverlaps } from "../src/overlap.ts";

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
});
