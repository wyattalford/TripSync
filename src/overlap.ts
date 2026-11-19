export type TimeInterval = { start: string; end: string };
export type PersonInterval = TimeInterval & { owner: string };
export type PartialSuggestion = TimeInterval & { available: string[]; unavailable: string[]; availableCount: number; totalCount: number };

type MillisecondInterval = { start: number; end: number };

function merged(intervals: MillisecondInterval[]): MillisecondInterval[] {
  const sorted = intervals.filter(({ start, end }) => start < end).sort((a, b) => a.start - b.start || a.end - b.end);
  const result: MillisecondInterval[] = [];
  for (const interval of sorted) {
    const last = result.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else result.push({ ...interval });
  }
  return result;
}

function withoutCommitments(openings: MillisecondInterval[], commitments: MillisecondInterval[]): MillisecondInterval[] {
  const result: MillisecondInterval[] = [];
  const blocked = merged(commitments);
  for (const opening of openings) {
    let cursor = opening.start;
    for (const commitment of blocked) {
      if (commitment.end <= cursor) continue;
      if (commitment.start >= opening.end) break;
      if (commitment.start > cursor) result.push({ start: cursor, end: Math.min(commitment.start, opening.end) });
      cursor = Math.max(cursor, commitment.end);
      if (cursor >= opening.end) break;
    }
    if (cursor < opening.end) result.push({ start: cursor, end: opening.end });
  }
  return result;
}

function intersection(left: MillisecondInterval[], right: MillisecondInterval[]): MillisecondInterval[] {
  const result: MillisecondInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i]!.start, right[j]!.start);
    const end = Math.min(left[i]!.end, right[j]!.end);
    if (start < end) result.push({ start, end });
    if (left[i]!.end < right[j]!.end) i++;
    else j++;
  }
  return merged(result);
}

export function fullGroupOverlaps({
  members, openings, commitments, from, to, now, durationMinutes,
}: {
  members: string[];
  openings: PersonInterval[];
  commitments: PersonInterval[];
  from: string;
  to: string;
  now: string | Date;
  durationMinutes: number;
}): TimeInterval[] {
  const durationMs = durationMinutes * 60_000;
  const lower = Math.max(Date.parse(from), new Date(now).getTime());
  const upper = Date.parse(to);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(durationMs) || durationMs <= 0 || lower >= upper) return [];
  const uniqueMembers = [...new Set(members)];
  if (uniqueMembers.length < 2) return [];
  let common: MillisecondInterval[] | undefined;
  for (const member of uniqueMembers) {
    const available = merged(openings.filter(({ owner }) => owner === member).map(({ start, end }) => ({
      start: Math.max(Date.parse(start), lower), end: Math.min(Date.parse(end), upper),
    })));
    const blocked = commitments.filter(({ owner }) => owner === member).map(({ start, end }) => ({
      start: Date.parse(start), end: Date.parse(end),
    }));
    const usable = withoutCommitments(available, blocked);
    common = common === undefined ? usable : intersection(common, usable);
    if (common.length === 0) return [];
  }
  return (common ?? []).filter(({ start, end }) => end - start >= durationMs)
    .map(({ start, end }) => ({ start: new Date(start).toISOString(), end: new Date(end).toISOString() }));
}

export function bestPartialGroupTimes({ members, openings, commitments, from, to, now, durationMinutes }: {
  members: string[]; openings: PersonInterval[]; commitments: PersonInterval[];
  from: string; to: string; now: string | Date; durationMinutes: number;
}): PartialSuggestion[] {
  const lower = Math.max(Date.parse(from), new Date(now).getTime());
  const upper = Date.parse(to);
  const durationMs = durationMinutes * 60_000;
  const people = [...new Set(members)];
  if (people.length < 3 || !Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper
    || !Number.isFinite(durationMs) || durationMs <= 0) return [];
  const usableByMember = new Map<string, MillisecondInterval[]>();
  const starts = new Set<number>();
  for (const member of people) {
    const available = merged(openings.filter((item) => item.owner === member).map((item) => ({
      start: Math.max(Date.parse(item.start), lower), end: Math.min(Date.parse(item.end), upper),
    })));
    const blocked = commitments.filter((item) => item.owner === member).map((item) => ({ start: Date.parse(item.start), end: Date.parse(item.end) }));
    const usable = withoutCommitments(available, blocked);
    usableByMember.set(member, usable);
    for (const interval of usable) starts.add(interval.start);
  }
  const segments: { start: number; end: number; available: string[] }[] = [];
  for (const time of [...starts].sort((a, b) => a - b)) {
    const covering = people.flatMap((member) => {
      const interval = usableByMember.get(member)?.find(({ start, end }) => start <= time && end - time >= durationMs);
      return interval ? [{ member, end: interval.end }] : [];
    });
    if (covering.length < 2 || covering.length === people.length) continue;
    const available = covering.map(({ member }) => member);
    const end = Math.min(...covering.map((item) => item.end));
    const previous = segments.at(-1);
    if (previous && previous.end >= time && previous.available.join("\0") === available.join("\0")) previous.end = Math.max(previous.end, end);
    else segments.push({ start: time, end, available });
  }
  const eligible = segments.filter((item) => item.end - item.start >= durationMs && item.available.length < people.length);
  const bestCount = Math.max(0, ...eligible.map((item) => item.available.length));
  return eligible.filter((item) => item.available.length === bestCount).map((item) => ({
    start: new Date(item.start).toISOString(), end: new Date(item.end).toISOString(),
    available: item.available, unavailable: people.filter((member) => !item.available.includes(member)),
    availableCount: item.available.length, totalCount: people.length,
  }));
}
