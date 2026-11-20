export type CalendarOpening = { opening: string; start: string; end: string; audiences: string[] };
export type CalendarSelection = { start: string; end: string };

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function parseLocalOpeningTime(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return local === value.slice(0, 16) ? date.toISOString() : null;
}

function minuteBoundary(day: Date, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute);
}

function ambiguousLocalTime(date: Date): boolean {
  for (const delta of [-86_400_000, 86_400_000]) {
    const offsetDifference = (date.getTimezoneOffset() - new Date(date.getTime() + delta).getTimezoneOffset()) * 60_000;
    if (!offsetDifference) continue;
    for (const direction of [-1, 1]) {
      const other = new Date(date.getTime() + direction * offsetDifference);
      if (other.getFullYear() === date.getFullYear() && other.getMonth() === date.getMonth()
        && other.getDate() === date.getDate() && other.getHours() === date.getHours() && other.getMinutes() === date.getMinutes()) return true;
    }
  }
  return false;
}

export type OpeningBlock = { opening: CalendarOpening; startMinute: number; endMinute: number; lane: number; lanes: number };

function wallMinute(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60_000;
}

export function dayOpeningBlocks(openings: CalendarOpening[], day: Date): OpeningBlock[] {
  const dayStart = addDays(day, 0).getTime();
  const dayEnd = addDays(day, 1).getTime();
  const blocks = openings.flatMap((opening) => {
    const start = Math.max(Date.parse(opening.start), dayStart);
    const end = Math.min(Date.parse(opening.end), dayEnd);
    if (start >= end) return [];
    let startMinute = start === dayStart ? 0 : wallMinute(new Date(start));
    let endMinute = end === dayEnd ? 1440 : wallMinute(new Date(end));
    if (endMinute <= startMinute) {
      const earlier = Math.min(startMinute, endMinute);
      endMinute = Math.max(startMinute, endMinute) + 30;
      startMinute = earlier;
    }
    // Keep very short openings clickable, including at the end of a day.
    if (endMinute - startMinute < 15) startMinute = Math.min(startMinute, 1425);
    endMinute = Math.min(1440, Math.max(endMinute, startMinute + 15));
    return [{ opening, startMinute, endMinute, lane: 0, lanes: 1 }];
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  let group: OpeningBlock[] = [];
  let laneEnds: number[] = [];
  function finishGroup() {
    for (const block of group) block.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  }
  for (const block of blocks) {
    if (laneEnds.length && laneEnds.every((end) => end <= block.startMinute)) finishGroup();
    let lane = laneEnds.findIndex((end) => end <= block.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = block.endMinute;
    block.lane = lane;
    group.push(block);
  }
  finishGroup();
  return blocks;
}

export function selectedIntervals(week: Date, firstDay: number, lastDay: number, firstSlot: number, lastSlot: number): CalendarSelection[] | null {
  const intervals: CalendarSelection[] = [];
  const startMinute = Math.min(firstSlot, lastSlot) * 30;
  const endMinute = (Math.max(firstSlot, lastSlot) + 1) * 30;
  for (let index = Math.min(firstDay, lastDay); index <= Math.max(firstDay, lastDay); index++) {
    const day = addDays(week, index);
    const start = minuteBoundary(day, startMinute);
    const end = minuteBoundary(day, endMinute);
    if (start.getHours() * 60 + start.getMinutes() !== startMinute
      || end.getHours() * 60 + end.getMinutes() !== endMinute % 1440
      || ambiguousLocalTime(start) || ambiguousLocalTime(end)
      || end.getTime() - start.getTime() !== (endMinute - startMinute) * 60_000) return null;
    intervals.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return intervals;
}
