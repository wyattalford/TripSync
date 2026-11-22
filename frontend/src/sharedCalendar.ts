import { addDays, ambiguousLocalTime, wallMinute } from "./calendar.ts";

export type CountInterval = { start: string; end: string; availableCount: number };
export type CalendarData = { timeline: CountInterval[]; windows: CountInterval[]; total: number };
export type SharedSegment = {
  start: number; end: number; startMinute: number; endMinute: number;
  count: number; muted: boolean; proposal: CountInterval | null;
};

export function sharedDetails(data: CalendarData, segment: SharedSegment) {
  const midpoint = (segment.start + segment.end) / 2;
  const interval = data.timeline.find((item) => Date.parse(item.start) <= midpoint && Date.parse(item.end) > midpoint);
  return {
    start: interval ? Date.parse(interval.start) : segment.start,
    end: interval ? Date.parse(interval.end) : segment.end,
    count: interval?.availableCount ?? null,
    muted: segment.muted,
    proposal: segment.proposal,
  };
}

export function sharedDaySegments(data: CalendarData, day: Date, options: {
  from: number; to: number; duration: number | null; everyone: boolean;
}): SharedSegment[] {
  const dayStart = addDays(day, 0).getTime(), dayEnd = addDays(day, 1).getTime();
  const windows = data.windows.flatMap((window) => {
    const start = Math.max(Date.parse(window.start), options.from);
    const end = Math.min(Date.parse(window.end), options.to);
    return end - start >= (options.duration ?? 1) * 60_000
      ? [{ start, end, availableCount: window.availableCount }] : [];
  });
  const boundaries = new Set([dayStart, dayEnd]);
  function addBoundary(time: number) {
    if (time > dayStart && time < dayEnd) boundaries.add(time);
  }
  addBoundary(options.from);
  addBoundary(options.to);
  for (const interval of data.timeline) {
    addBoundary(Date.parse(interval.start));
    addBoundary(Date.parse(interval.end));
  }
  for (const window of windows) {
    addBoundary(window.start);
    addBoundary(window.end);
  }
  const times = [...boundaries].sort((a, b) => a - b);
  return times.slice(0, -1).map((start, index) => {
    const end = times[index + 1]!, midpoint = (start + end) / 2;
    const interval = data.timeline.find((item) => Date.parse(item.start) <= midpoint && Date.parse(item.end) > midpoint);
    const count = interval?.availableCount ?? 0;
    const covering = windows.filter((window) => window.start <= midpoint && window.end > midpoint);
    const muted = !interval || midpoint < options.from || midpoint >= options.to
      || (options.everyone && count !== data.total)
      || (options.duration !== null && (count === 0 || !covering.some((window) => window.availableCount >= count)));
    const candidate = muted ? undefined : covering.map((window) => ({
      ...window, start: Math.ceil(window.start / 60_000) * 60_000, end: Math.floor(window.end / 60_000) * 60_000,
    })).filter((window) => window.availableCount >= 2
      && window.end - window.start >= (options.duration ?? 1) * 60_000
      && !ambiguousLocalTime(new Date(window.start)) && !ambiguousLocalTime(new Date(window.end))
      && (options.duration === null || window.availableCount >= count))
      .sort((a, b) => b.availableCount - a.availableCount || (b.end - b.start) - (a.end - a.start))[0];
    let startMinute = start === dayStart ? 0 : wallMinute(new Date(start));
    let endMinute = end === dayEnd ? 1440 : wallMinute(new Date(end));
    if (endMinute <= startMinute) {
      const earlier = Math.min(startMinute, endMinute);
      endMinute = Math.max(startMinute, endMinute);
      startMinute = earlier;
      if (endMinute === startMinute) {
        startMinute = Math.floor(startMinute / 60) * 60;
        endMinute = startMinute + 60;
      }
    }
    return {
      start, end, startMinute, endMinute, count, muted,
      proposal: candidate ? { start: new Date(candidate.start).toISOString(), end: new Date(candidate.end).toISOString(), availableCount: candidate.availableCount } : null,
    };
  });
}
