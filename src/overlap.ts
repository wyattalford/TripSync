export type TimeInterval = { start: string; end: string };
export type PersonInterval = TimeInterval & { owner: string };

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
