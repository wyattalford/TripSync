// Main navigation: section names, URL mapping, and the "do the links fit?" rule.

export type Section = "groups" | "openings" | "shared-time" | "gatherings" | "notices" | "settings";

export const NAV_ITEMS: readonly { section: Section; label: string }[] = [
  { section: "groups", label: "Groups" },
  { section: "openings", label: "My free time" },
  { section: "shared-time", label: "Find a time" },
  { section: "gatherings", label: "Gatherings" },
  { section: "notices", label: "Notifications" },
];

export const HOME_SECTION: Section = "groups";

/** Account pages reached from the account area of the header rather than the main links. */
export const SETTINGS_SECTION: Section = "settings";

export function isSection(value: string): value is Section {
  return value === SETTINGS_SECTION || NAV_ITEMS.some((item) => item.section === value);
}

/**
 * Which section a URL shows. A `#section` hash wins; otherwise a notice destination path
 * (/gatherings/<id> or /groups/<id>) opens its section; anything else is home.
 */
export function sectionFromLocation(hash: string, pathname: string): Section {
  const fromHash = hash.replace(/^#/, "");
  if (isSection(fromHash)) return fromHash;
  return pathname.startsWith("/gatherings/") ? "gatherings" : HOME_SECTION;
}

/** The URL for a section. Always rooted at "/" so it also leaves a /groups/<id> deep link. */
export function sectionHref(section: Section): string {
  return `/#${section}`;
}

/** Whether the inline links fit beside the wordmark in the header bar. */
export function linksFit(barWidth: number, brandWidth: number, linksWidth: number, gap: number): boolean {
  return brandWidth + gap + linksWidth <= barWidth;
}
