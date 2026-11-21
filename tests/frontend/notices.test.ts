import { describe, expect, test } from "bun:test";
import {
  badgeLabel, contextLabel, noticeContext, parseDestination, relativeTime, splitInbox, unreadCount, type NoticeSummary,
} from "../../frontend/src/notices.ts";

const groupId = "11111111-1111-4111-8111-111111111111";
const gatheringId = "22222222-2222-4222-8222-222222222222";
const groups = [{ group: groupId, name: "Movie crew" }];
const gatherings = [{ gathering: gatheringId, activity: "Film night" }];

function item(notice: string, readAt: string | null, createdAt = "2030-01-01T12:00:00.000Z"): NoticeSummary {
  return { notice, message: "m", destination: `/groups/${groupId}`, createdAt, readAt };
}

describe("notice destinations", () => {
  test("parses group and gathering paths", () => {
    expect(parseDestination(`/groups/${groupId}`)).toEqual({ kind: "group", id: groupId });
    expect(parseDestination(`/gatherings/${gatheringId}`)).toEqual({ kind: "gathering", id: gatheringId });
  });

  test("rejects anything else", () => {
    for (const destination of ["", "/groups/", `/groups/${groupId}/`, `/openings/${groupId}`, `https://evil.example/groups/${groupId}`, "/groups/abc"]) {
      expect(parseDestination(destination)).toBeNull();
    }
  });

  test("names the group or gathering the person can currently see", () => {
    expect(noticeContext(`/groups/${groupId}`, groups, gatherings)).toBe("Movie crew");
    expect(noticeContext(`/gatherings/${gatheringId}`, groups, gatherings)).toBe("Film night");
  });

  test("the context line is omitted when the message already names it", () => {
    const named = { ...item("a", null), message: "You have been invited to Movie crew" };
    const generic = { ...item("b", null), message: "An invitee accepted your proposal", destination: `/gatherings/${gatheringId}` };
    expect(contextLabel(named, groups, gatherings)).toBe("");
    expect(contextLabel(generic, groups, gatherings)).toBe("Film night");
  });

  test("falls back to a generic label when the target is no longer visible", () => {
    expect(noticeContext(`/groups/${gatheringId}`, groups, gatherings)).toBe("A group");
    expect(noticeContext(`/gatherings/${groupId}`, groups, gatherings)).toBe("A gathering");
    expect(noticeContext("/somewhere", groups, gatherings)).toBe("OpenTime");
  });
});

describe("inbox grouping and counts", () => {
  const inbox = [item("c", null), item("b", "2030-01-01T13:00:00.000Z"), item("a", null)];

  test("counts unread notices", () => {
    expect(unreadCount(inbox)).toBe(2);
    expect(unreadCount([])).toBe(0);
  });

  test("splits unread from read and keeps newest-first order", () => {
    expect(splitInbox(inbox)).toEqual({ unread: [inbox[0], inbox[2]], read: [inbox[1]] });
    expect(splitInbox([])).toEqual({ unread: [], read: [] });
  });

  test("badge is hidden at zero and capped at 99+", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(-1)).toBe("");
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(100)).toBe("99+");
  });
});

describe("relative notice times", () => {
  const now = new Date(2030, 5, 15, 18, 0);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  test("recent times read naturally", () => {
    expect(relativeTime(ago(0), now)).toBe("Just now");
    expect(relativeTime(ago(0.5), now)).toBe("Just now");
    expect(relativeTime(ago(1), now)).toBe("1 min ago");
    expect(relativeTime(ago(59), now)).toBe("59 min ago");
    expect(relativeTime(ago(60), now)).toBe("1 hr ago");
    expect(relativeTime(ago(17 * 60), now)).toBe("17 hr ago");
  });

  test("earlier days show Yesterday, then a date", () => {
    expect(relativeTime(new Date(2030, 5, 14, 23, 30).toISOString(), now)).toBe("Yesterday");
    expect(relativeTime(new Date(2030, 5, 10, 9, 0).toISOString(), now))
      .toBe(new Date(2030, 5, 10).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    expect(relativeTime(new Date(2029, 11, 31, 9, 0).toISOString(), now))
      .toBe(new Date(2029, 11, 31).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }));
  });

  test("invalid input yields an empty label", () => {
    expect(relativeTime("not a date", now)).toBe("");
  });
});
