import { describe, expect, test } from "bun:test";
import { addDays, dayOpeningBlocks, parseLocalOpeningTime, selectedIntervals, startOfWeek } from "../../frontend/src/calendar.ts";

describe("weekly free-time calendar", () => {
  test("finds Monday and navigates across month and year boundaries", () => {
    const monday = startOfWeek(new Date(2030, 0, 6, 15));
    expect(monday).toEqual(new Date(2029, 11, 31));
    expect(addDays(monday, 7)).toEqual(new Date(2030, 0, 7));
    expect(addDays(monday, -7)).toEqual(new Date(2029, 11, 24));
  });

  test("creates one interval per selected day regardless of drag direction, including midnight", () => {
    const week = new Date(2030, 0, 7);
    const forward = selectedIntervals(week, 1, 3, 45, 47);
    expect(forward).toEqual([1, 2, 3].map((day) => ({
      start: new Date(2030, 0, 7 + day, 22, 30).toISOString(),
      end: new Date(2030, 0, 8 + day).toISOString(),
    })));
    expect(selectedIntervals(week, 3, 1, 47, 45)).toEqual(forward);
    expect(selectedIntervals(week, 0, 0, 21, 21)).toEqual([{
      start: new Date(2030, 0, 7, 10, 30).toISOString(),
      end: new Date(2030, 0, 7, 11).toISOString(),
    }]);
  });

  test("renders continuous opening blocks at their precise times, clipped to each day", () => {
    const day = new Date(2030, 0, 7);
    const openings = [
      { opening: "first", start: new Date(2030, 0, 7, 9, 0).toISOString(), end: new Date(2030, 0, 7, 9, 30).toISOString(), audiences: [] },
      { opening: "second", start: new Date(2030, 0, 7, 9, 30).toISOString(), end: new Date(2030, 0, 7, 10, 15).toISOString(), audiences: ["group"] },
      { opening: "overnight", start: new Date(2030, 0, 7, 23, 30).toISOString(), end: new Date(2030, 0, 8, 0, 30).toISOString(), audiences: [] },
    ];
    expect(dayOpeningBlocks(openings, day)).toEqual([
      { opening: openings[0], startMinute: 540, endMinute: 570, lane: 0, lanes: 1 },
      { opening: openings[1], startMinute: 570, endMinute: 615, lane: 0, lanes: 1 },
      { opening: openings[2], startMinute: 1410, endMinute: 1440, lane: 0, lanes: 1 },
    ]);
    expect(dayOpeningBlocks(openings, addDays(day, 1))).toEqual([
      { opening: openings[2], startMinute: 0, endMinute: 30, lane: 0, lanes: 1 },
    ]);
    expect(dayOpeningBlocks(openings, addDays(day, 2))).toEqual([]);
  });

  test("keeps short adjacent openings separately clickable without crossing midnight", () => {
    const day = new Date(2030, 0, 7);
    const openings = [
      { opening: "first", start: new Date(2030, 0, 7, 23, 57).toISOString(), end: new Date(2030, 0, 7, 23, 58).toISOString(), audiences: [] },
      { opening: "second", start: new Date(2030, 0, 7, 23, 58).toISOString(), end: new Date(2030, 0, 8).toISOString(), audiences: [] },
    ];
    const blocks = dayOpeningBlocks(openings, day);
    expect(blocks.map(({ startMinute, endMinute, lane, lanes }) => ({ startMinute, endMinute, lane, lanes }))).toEqual([
      { startMinute: 1425, endMinute: 1440, lane: 0, lanes: 2 },
      { startMinute: 1425, endMinute: 1440, lane: 1, lanes: 2 },
    ]);
  });

  test("refuses ambiguous or nonexistent half-hour selections at daylight saving transitions", () => {
    if (new Date(2030, 2, 10, 1).getTimezoneOffset() === new Date(2030, 2, 10, 3).getTimezoneOffset()) return;
    const springWeek = startOfWeek(new Date(2030, 2, 10));
    expect(selectedIntervals(springWeek, 6, 6, 4, 4)).toBeNull();
    expect(selectedIntervals(springWeek, 6, 6, 3, 3)).toBeNull();
    expect(parseLocalOpeningTime("2030-03-10T02:30")).toBeNull();
    const autumnWeek = startOfWeek(new Date(2030, 10, 3));
    expect(selectedIntervals(autumnWeek, 6, 6, 2, 2)).toBeNull();
    expect(selectedIntervals(autumnWeek, 6, 6, 3, 3)).toBeNull();
  });
});
