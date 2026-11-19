import type { Db } from "mongodb";
import { readUsernames } from "./concepts/Authenticating.ts";
import { readGroupAccess } from "./concepts/Grouping.ts";
import { readSharedIntervals } from "./concepts/AvailabilitySharing.ts";
import { readConfirmedCommitments } from "./concepts/Gathering.ts";
import { bestPartialGroupTimes, fullGroupOverlaps } from "./overlap.ts";

type Search = { user: string; group: string; from: string; to: string; duration: number; now: Date };

export async function readOverlapSnapshot(db: Db, input: Search, afterMembershipRead?: () => Promise<void>) {
  const session = db.client.startSession({ causalConsistency: false });
  try {
    return await session.withTransaction(async () => {
      const { allowed, members } = await readGroupAccess(db, input.user, input.group, session);
      if (!allowed) return { allowed: false, overlaps: [] as { start: string; end: string }[], suggestions: [] as {
        start: string; end: string; availableCount: number; totalCount: number; unavailable: { user: string; username: string }[];
      }[] };
      if (afterMembershipRead) await afterMembershipRead();
      const intervals = await readSharedIntervals(db, input.group, input.from, input.to, input.now, session);
      const commitments = await readConfirmedCommitments(db, members, input.from, input.to, input.now, session);
      const overlaps = fullGroupOverlaps({ members, openings: intervals, commitments, from: input.from, to: input.to, now: input.now, durationMinutes: input.duration });
      if (overlaps.length) return { allowed: true, overlaps, suggestions: [] };
      const partial = bestPartialGroupTimes({ members, openings: intervals, commitments, from: input.from, to: input.to, now: input.now, durationMinutes: input.duration });
      const usernames = await readUsernames(db, members, session);
      return { allowed: true, overlaps, suggestions: partial.map((item) => ({ start: item.start, end: item.end,
        availableCount: item.availableCount, totalCount: item.totalCount,
        unavailable: item.unavailable.map((user) => ({ user, username: usernames.get(user) ?? "Former member" })) })) };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
}
