import { describe, expect, test } from "bun:test";
import { HOME_SECTION, NAV_ITEMS, isSection, linksFit, sectionFromLocation, sectionHref } from "../../frontend/src/nav.ts";

const id = "11111111-1111-4111-8111-111111111111";

describe("main navigation", () => {
  test("lists every section once, in task order, with user-facing names", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Groups", "My free time", "Find a time", "Gatherings", "Notifications"]);
    expect(new Set(NAV_ITEMS.map((item) => item.section)).size).toBe(NAV_ITEMS.length);
    expect(HOME_SECTION).toBe("groups");
  });

  test("recognizes only real sections", () => {
    for (const item of NAV_ITEMS) expect(isSection(item.section)).toBe(true);
    for (const value of ["", "home", "Groups", "notices ", "#groups"]) expect(isSection(value)).toBe(false);
  });

  test("a section hash decides the page, with or without the #", () => {
    for (const item of NAV_ITEMS) {
      expect(sectionFromLocation(`#${item.section}`, "/")).toBe(item.section);
      expect(sectionFromLocation(item.section, "/")).toBe(item.section);
    }
    expect(sectionFromLocation("#notices", `/gatherings/${id}`)).toBe("notices");
  });

  test("notice destination paths open their section; anything else is home", () => {
    expect(sectionFromLocation("", `/gatherings/${id}`)).toBe("gatherings");
    expect(sectionFromLocation("", `/groups/${id}`)).toBe("groups");
    expect(sectionFromLocation("", "/")).toBe("groups");
    expect(sectionFromLocation("#unknown", "/")).toBe("groups");
    expect(sectionFromLocation("", `/join/${id}`)).toBe("groups");
  });

  test("section links are rooted so they leave deep-link paths", () => {
    expect(sectionHref("notices")).toBe("/#notices");
    expect(sectionHref("shared-time")).toBe("/#shared-time");
  });

  test("links stay inline only while they fit beside the wordmark", () => {
    expect(linksFit(1000, 120, 700, 32)).toBe(true);
    expect(linksFit(852, 120, 700, 32)).toBe(true);
    expect(linksFit(851, 120, 700, 32)).toBe(false);
    expect(linksFit(390, 120, 700, 32)).toBe(false);
  });
});
