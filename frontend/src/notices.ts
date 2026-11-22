// Pure helpers for the notices inbox. Kept free of Vue so they can be unit-tested.

export type NoticeSummary = { notice: string; message: string; destination: string; createdAt: string; readAt: string | null };
export type NoticeKind = "group" | "gathering";
export type NamedGroup = { group: string; name: string };
export type NamedGathering = { gathering: string; activity: string };

const DESTINATION = /^\/(groups|gatherings)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Parses a notice destination into what it points at, or null for anything else. */
export function parseDestination(destination: string): { kind: NoticeKind; id: string } | null {
  const match = DESTINATION.exec(destination);
  if (!match) return null;
  return { kind: match[1] === "groups" ? "group" : "gathering", id: match[2]! };
}

/**
 * Names the group or gathering a notice is about, using what the person can currently see.
 * Falls back to a generic label when it is no longer visible to them (left, removed, closed).
 */
export function noticeContext(destination: string, groups: NamedGroup[], gatherings: NamedGathering[]): string {
  const target = parseDestination(destination);
  if (!target) return "OpenTime";
  if (target.kind === "group") return groups.find((item) => item.group === target.id)?.name ?? "A group";
  return gatherings.find((item) => item.gathering === target.id)?.activity ?? "A gathering";
}

/** The context to show under a notice, or "" when the message already names it. */
export function contextLabel(item: NoticeSummary, groups: NamedGroup[], gatherings: NamedGathering[]): string {
  const context = noticeContext(item.destination, groups, gatherings);
  return item.message.includes(context) ? "" : context;
}

export function unreadCount(notices: NoticeSummary[]): number {
  return notices.filter((item) => !item.readAt).length;
}

/** Splits the inbox into unread ("New") and read ("Earlier"), keeping newest-first order. */
export function splitInbox(notices: NoticeSummary[]): { unread: NoticeSummary[]; read: NoticeSummary[] } {
  return { unread: notices.filter((item) => !item.readAt), read: notices.filter((item) => item.readAt) };
}

/** A short badge label: hidden at zero, capped so the nav stays compact. */
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", then a short date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60 && then.getDate() === now.getDate()) return `${Math.floor(minutes / 60)} hr ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}
