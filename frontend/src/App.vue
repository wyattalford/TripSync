<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "./api.ts";
import WeeklyCalendar from "./WeeklyCalendar.vue";
import SharedCalendar from "./SharedCalendar.vue";
import AuthPanel from "./AuthPanel.vue";
import NoticesPanel from "./NoticesPanel.vue";
import AppHeader from "./AppHeader.vue";
import { unreadCount, type NoticeSummary } from "./notices.ts";
import { sectionFromLocation as sectionForUrl, sectionHref, type Section } from "./nav.ts";
import { onSessionEnded } from "./session.ts";
import { parseLocalOpeningTime, type CalendarSelection } from "./calendar.ts";

type GroupSummary = { group: string; name: string; owner: string; membership: string; memberCount: number };
type Opening = { opening: string; start: string; end: string; audiences: string[] };
type Interval = { start: string; end: string };
type PartialSuggestion = Interval & { availableCount: number; totalCount: number; unavailable: { user: string; username: string }[] };
type Member = { user: string; username: string };
type GatheringSummary = { gathering: string; organizer: string; context: string; version: string; number: number; purpose: string; activity: string; place: string; start: string; end: string; status: string; myResponse: string; invitees: string[]; accepted: string[]; pending: string[]; declined: string[]; withdrawn: string[]; attendees: string[] };
function sectionFromLocation(): Section {
  return sectionForUrl(location.hash, location.pathname);
}

const activeSection = ref<Section>(sectionFromLocation());
function syncSection() { activeSection.value = sectionFromLocation(); }

// Main navigation: switch section, record it in the URL, and always start at the top of the page.
function navigate(section: Section) {
  if (location.pathname + location.hash !== sectionHref(section)) history.pushState({}, "", sectionHref(section));
  activeSection.value = section;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

async function scrollToDestination() {
  if (!/^\/(groups|gatherings)\/[0-9a-f-]{36}$/.test(location.pathname) || location.hash) return;
  await nextTick();
  document.getElementById(`destination-${location.pathname.split("/")[2]}`)?.scrollIntoView();
}

function handleLocationChange() {
  syncSection();
  void scrollToDestination();
}

const sessionNotice = ref("");
const currentUsername = ref("");
const currentUser = ref("");
const groups = ref<GroupSummary[]>([]);
const openings = ref<Opening[]>([]);
const openingId = ref("");
const openingStart = ref("");
const openingEnd = ref("");
const openingAudiences = ref<string[]>([]);
const openingEditorOpen = ref(false);
const openingDrafts = ref<CalendarSelection[]>([]);
const selectedOpeningEnded = computed(() => {
  const opening = openings.value.find((item) => item.opening === openingId.value);
  return !!opening && new Date(opening.end) <= new Date();
});
const shareableGroups = computed(() => groups.value.filter((group) => group.membership === "MEMBER"));
const allOpeningGroupsSelected = computed(() => shareableGroups.value.length > 0 && shareableGroups.value.every((group) => openingAudiences.value.includes(group.group)));
const searchGroup = ref("");
const searchScope = ref<"everyone" | "selected">("everyone");
const searchInvitees = ref<string[]>([]);
const searchMembers = computed(() => (rosters.value[searchGroup.value] ?? []).filter((member) => member.user !== currentUser.value));
const searchFrom = ref("");
const searchTo = ref("");
const searchDuration = ref(60);
const overlaps = ref<Interval[]>([]);
const suggestions = ref<PartialSuggestion[]>([]);
const searched = ref(false);
const gatherings = ref<GatheringSummary[]>([]);
const notices = ref<NoticeSummary[]>([]);
const unreadNotices = computed(() => unreadCount(notices.value));
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let stopSessionWatch: (() => void) | undefined;
const extraInvitees = ref<Record<string, string>>({});
const rosters = ref<Record<string, Member[]>>({});
const proposalGroup = ref("");
const proposalInvitees = ref<string[]>([]);
const proposalPurpose = ref("");
const proposalActivity = ref("");
const proposalPlace = ref("");
const proposalStart = ref("");
const proposalEnd = ref("");
const proposalOverlap = ref("");
const confirmationReview = ref<GatheringSummary | null>(null);
let gatheringRefreshId = 0;
let backgroundGatheringRefresh = false;
const editingGathering = ref<GatheringSummary | null>(null);
const editPurpose = ref("");
const editActivity = ref("");
const editPlace = ref("");
const editStart = ref("");
const editEnd = ref("");
const groupName = ref("");
const joinInput = ref(location.pathname.startsWith("/join/") ? location.href : "");
const inviteNames = ref<Record<string, string>>({});
const removeNames = ref<Record<string, string>>({});
const joinLinks = ref<Record<string, string>>({});
const busy = ref(false);
const loading = ref(true);
const message = ref("");
const messageKind = ref<"error" | "success">("success");

function showMessage(text: string, kind: "error" | "success") {
  message.value = text;
  messageKind.value = kind;
}

function groupError(error: string): string {
  if (error === "UNAUTHORIZED") return "Your session ended. Sign in again.";
  if (error === "FORBIDDEN") return "You are not allowed to make that change.";
  if (error === "CONFLICT") return "This membership or link has changed. Refresh and try again.";
  if (error === "INVALID_REQUEST") return "Check the group name, username, or link.";
  if (error === "NOT_FOUND") return "That username or group was not found.";
  return "OpenTime could not complete that request. Try again.";
}

function openingError(error: string): string {
  if (error === "UNAUTHORIZED") return "Your session ended. Sign in again.";
  if (error === "FORBIDDEN") return "You can only change your own opening and share it with groups you belong to.";
  if (error === "NOT_FOUND") return "This opening cannot be found.";
  if (error === "CONFLICT") return "Your openings cannot overlap. Change one of the time ranges.";
  if (error === "INVALID_REQUEST") return "Enter a valid time range that has not ended.";
  if (error === "INTERNAL_ERROR") return "Could not read a consistent group snapshot. Please retry the search.";
  return "OpenTime could not complete that request. Try again.";
}

function gatheringError(error: string): string {
  if (error === "UNAUTHORIZED") return "Your session ended. Sign in again.";
  if (error === "FORBIDDEN") return "You are not allowed to change this gathering or invite these people.";
  if (error === "CONFLICT") return "The accepted roster, version, or commitments changed. Refresh the gathering and try again.";
  if (error === "INVALID_REQUEST") return "Enter changed details with a valid future time, purpose, activity, and place.";
  return "OpenTime could not complete that request. Try again.";
}

async function refreshNotices() {
  const result = await api.notices.list();
  if ("error" in result) return;
  notices.value = result.notices;
}

async function markAllNoticesRead() {
  busy.value = true;
  try {
    const result = await api.notices["mark-all-read"]();
    if ("error" in result) return showMessage("Could not mark your notices read. Try again.", "error");
    await refreshNotices();
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function openNotice(item: NoticeSummary) {
  if (!item.readAt) {
    const result = await api.notices["mark-read"]({ notice: item.notice });
    if ("error" in result) return showMessage("Could not mark this notice read. Try again.", "error");
    await refreshNotices();
  }
  if (!/^\/(groups|gatherings)\/[0-9a-f-]{36}$/.test(item.destination)) return;
  history.pushState({}, "", item.destination);
  syncSection();
  await Promise.all([refreshGroups(), refreshGatherings()]);
  await nextTick();
  const target = document.getElementById(`destination-${item.destination.split("/")[2]}`);
  if (target) target.scrollIntoView({ behavior: "smooth" });
  else showMessage("This item is no longer available to your account.", "error");
}

function memberName(group: string, user: string): string {
  return rosters.value[group]?.find((member) => member.user === user)?.username ?? (user === currentUser.value ? currentUsername.value : "Former member");
}

async function loadRoster(group: string, quiet = false) {
  const user = currentUser.value;
  if (!group || !user) return;
  const result = await api.groups.members({ group });
  if (currentUser.value !== user) return;
  if ("error" in result) {
    if (!quiet) {
      showMessage(groupError(result.error), "error");
      rosters.value[group] = [];
    }
  } else rosters.value[group] = result.accounts;
}

async function refreshGatherings(quiet = false) {
  const requestId = ++gatheringRefreshId;
  const result = await api.gatherings.list();
  if (requestId !== gatheringRefreshId || !currentUser.value) return false;
  if ("error" in result) {
    if (!quiet) showMessage(gatheringError(result.error), "error");
    return false;
  }
  gatherings.value = result.gatherings;
  if (!result.gatherings.some((item) => item.gathering === confirmationReview.value?.gathering && item.status === "PROPOSED")) {
    confirmationReview.value = null;
  }
  const contexts = new Set(result.gatherings.map((gathering) => gathering.context));
  await Promise.all([...contexts].filter((group) => !quiet || !rosters.value[group]).map((group) => loadRoster(group, quiet)));
  return true;
}

function refreshVisibleGatherings() {
  if (!currentUser.value || activeSection.value !== "gatherings" || document.hidden || busy.value || backgroundGatheringRefresh) return;
  backgroundGatheringRefresh = true;
  void refreshGatherings(true)
    .catch(() => { /* A later refresh will retry without interrupting the current task. */ })
    .finally(() => { backgroundGatheringRefresh = false; });
}

async function proposeFromOverlap(interval: Interval | PartialSuggestion) {
  proposalGroup.value = searchGroup.value;
  proposalPurpose.value = "";
  proposalStart.value = localInput(interval.start);
  proposalEnd.value = localInput(interval.end);
  proposalOverlap.value = "availableCount" in interval
    ? `${interval.availableCount} of ${interval.totalCount} members had shared availability at this time.`
    : searchScope.value === "selected"
      ? "You and the selected members had shared availability at this time."
      : "All group members had shared availability at this time.";
  proposalInvitees.value = searchScope.value === "selected" ? [...searchInvitees.value] : [];
  navigate("gatherings");
  await nextTick();
  document.getElementById("proposal-form")?.scrollIntoView({ behavior: "smooth" });
}

async function proposeFromCalendar(group: string, interval: { start: string; end: string; availableCount: number }) {
  proposalGroup.value = group;
  proposalPurpose.value = "";
  proposalStart.value = localInput(interval.start);
  proposalEnd.value = localInput(interval.end);
  proposalOverlap.value = `${interval.availableCount} group members had shared availability at this time.`;
  proposalInvitees.value = [];
  navigate("gatherings");
  await nextTick();
  document.getElementById("proposal-form")?.scrollIntoView({ behavior: "smooth" });
}

async function proposeGathering() {
  const start = absoluteTime(proposalStart.value), end = absoluteTime(proposalEnd.value);
  if (!proposalGroup.value || proposalInvitees.value.length === 0 || !proposalPurpose.value.trim() || !proposalActivity.value.trim()
    || !proposalPlace.value.trim() || !start || !end || start <= new Date().toISOString() || start >= end) {
    return showMessage("Choose invitees, future times, a purpose, activity, and place.", "error");
  }
  busy.value = true;
  try {
    const result = await api.gatherings.propose({ group: proposalGroup.value, invitees: proposalInvitees.value,
      purpose: proposalPurpose.value.trim(), activity: proposalActivity.value.trim(), place: proposalPlace.value.trim(), start, end });
    if ("error" in result) return showMessage(gatheringError(result.error), "error");
    proposalInvitees.value = [];
    proposalActivity.value = "";
    proposalPlace.value = "";
    proposalStart.value = "";
    proposalEnd.value = "";
    await refreshGatherings();
    showMessage("Proposal sent. Invitees can accept or decline these details.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function respondGathering(gathering: GatheringSummary, action: "accept" | "decline") {
  busy.value = true;
  try {
    const result = action === "accept"
      ? await api.gatherings.accept({ gathering: gathering.gathering, version: gathering.version })
      : await api.gatherings.decline({ gathering: gathering.gathering, version: gathering.version });
    if ("error" in result) return showMessage(gatheringError(result.error), "error");
    await refreshGatherings();
    if (action === "accept" && "joined" in result && result.joined) searched.value = false;
    showMessage(action === "decline" ? "You declined these details."
      : "joined" in result && result.joined ? "You joined the confirmed gathering." : "You accepted these details. The organizer can confirm when ready.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

function beginGatheringEdit(gathering: GatheringSummary) {
  editingGathering.value = gathering;
  editPurpose.value = gathering.purpose;
  editActivity.value = gathering.activity;
  editPlace.value = gathering.place;
  editStart.value = localInput(gathering.start);
  editEnd.value = localInput(gathering.end);
  document.getElementById("gathering-edit")?.scrollIntoView({ behavior: "smooth" });
}

function cancelGatheringEdit() { editingGathering.value = null; }

async function saveGatheringEdit() {
  const previous = editingGathering.value;
  if (!previous) return;
  const start = absoluteTime(editStart.value), end = absoluteTime(editEnd.value);
  const purpose = editPurpose.value.trim(), activity = editActivity.value.trim(), place = editPlace.value.trim();
  if (!purpose || !activity || !place || !start || !end || start <= new Date().toISOString() || start >= end) {
    return showMessage("Enter a purpose, activity, place, and valid future time range.", "error");
  }
  if (purpose === previous.purpose && activity === previous.activity && place === previous.place
    && start === previous.start && end === previous.end) return showMessage("Change at least one detail.", "error");
  if (previous.status === "CONFIRMED" && !window.confirm("Editing releases this confirmed plan. Everyone must accept the new details before you can confirm it again. Continue?")) return;
  busy.value = true;
  try {
    const result = await api.gatherings.edit({ gathering: previous.gathering, expectedVersion: previous.version, purpose, activity, place, start, end });
    if ("error" in result) {
      await refreshGatherings();
      return showMessage(gatheringError(result.error), "error");
    }
    cancelGatheringEdit();
    await refreshGatherings();
    searched.value = false;
    showMessage("New version saved. Previous responses and confirmed commitments no longer apply. Invitees need to respond again.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

function reviewChanged(review: GatheringSummary, current: GatheringSummary): boolean {
  return review.version !== current.version ||
    !sameMembers(review.accepted, current.accepted) ||
    !sameMembers(review.pending, current.pending);
}

function sameMembers(before: string[], after: string[]): boolean {
  return before.length === after.length && before.every((member) => after.includes(member));
}

async function confirmGathering(gathering: GatheringSummary) {
  const reviewed = confirmationReview.value;
  const current = gatherings.value.find((item) => item.gathering === gathering.gathering);
  if (busy.value || !reviewed || !current || current.status !== "PROPOSED" ||
    reviewed.gathering !== current.gathering || reviewChanged(reviewed, current)) return;
  busy.value = true;
  try {
    const result = await api.gatherings.confirm({
      gathering: reviewed.gathering, version: reviewed.version, expectedAttendees: reviewed.accepted,
    });
    if ("error" in result) {
      await refreshGatherings();
      const latest = gatherings.value.find((item) => item.gathering === reviewed.gathering);
      if (latest && reviewChanged(reviewed, latest)) {
        return showMessage("Responses or details changed. Review the current gathering before confirming.", "error");
      }
      confirmationReview.value = null;
      return showMessage(gatheringError(result.error), "error");
    }
    confirmationReview.value = null;
    await refreshGatherings();
    searched.value = false;
    showMessage("Gathering confirmed for the accepted people.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function inviteToGathering(gathering: GatheringSummary) {
  const invitee = extraInvitees.value[gathering.gathering];
  if (!invitee) return showMessage("Choose a current group member to invite.", "error");
  busy.value = true;
  try {
    const result = await api.gatherings.invite({ gathering: gathering.gathering, version: gathering.version, invitee });
    if ("error" in result) {
      await refreshGatherings();
      return showMessage(gatheringError(result.error), "error");
    }
    extraInvitees.value[gathering.gathering] = "";
    await refreshGatherings();
    showMessage("Invitation added. This person can respond to the current version.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function withdrawFromGathering(gathering: GatheringSummary) {
  if (!window.confirm("Withdraw your acceptance from this gathering?")) return;
  busy.value = true;
  try {
    const result = await api.gatherings.withdraw({ gathering: gathering.gathering, version: gathering.version });
    if ("error" in result) {
      await refreshGatherings();
      return showMessage(gatheringError(result.error), "error");
    }
    await refreshGatherings();
    searched.value = false;
    showMessage(result.status === "CANCELLED" ? "You withdrew. The gathering closed because no one else is attending or pending." : "You withdrew from this gathering.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function cancelGathering(gathering: GatheringSummary) {
  if (!window.confirm("Cancel this gathering for everyone? Confirmed commitments will be released.")) return;
  busy.value = true;
  try {
    const result = await api.gatherings.cancel({ gathering: gathering.gathering, version: gathering.version });
    if ("error" in result) {
      await refreshGatherings();
      return showMessage(gatheringError(result.error), "error");
    }
    if (editingGathering.value?.gathering === gathering.gathering) cancelGatheringEdit();
    await refreshGatherings();
    searched.value = false;
    showMessage("Gathering cancelled. Its confirmed commitments were released.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

watch(activeSection, refreshVisibleGatherings);
watch([proposalGroup, proposalStart, proposalEnd], () => { proposalOverlap.value = ""; }, { flush: "sync" });
watch(proposalGroup, (group) => { proposalInvitees.value = []; void loadRoster(group); }, { flush: "sync" });
watch(searchGroup, (group) => {
  searchInvitees.value = [];
  if (searchScope.value === "selected") void loadRoster(group);
});
watch(searchScope, (scope) => {
  if (scope === "selected") void loadRoster(searchGroup.value);
});
watch([searchGroup, searchFrom, searchTo, searchDuration, searchScope, searchInvitees], () => {
  overlaps.value = [];
  suggestions.value = [];
  searched.value = false;
});

function localTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function localInput(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function absoluteTime(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function refreshOpenings() {
  const result = await api.openings.mine();
  if ("error" in result) showMessage(openingError(result.error), "error");
  else openings.value = result.openings;
}

function resetOpeningForm() {
  openingEditorOpen.value = false;
  openingId.value = "";
  openingStart.value = "";
  openingEnd.value = "";
  openingAudiences.value = [];
  openingDrafts.value = [];
}

async function editOpening(opening: Opening) {
  message.value = "";
  openingEditorOpen.value = true;
  openingId.value = opening.opening;
  openingStart.value = localInput(opening.start);
  openingEnd.value = localInput(opening.end);
  openingAudiences.value = opening.audiences.filter((id) => shareableGroups.value.some((group) => group.group === id));
  openingDrafts.value = [];
  await nextTick();
  document.getElementById("opening-form")?.scrollIntoView({ behavior: "smooth" });
}

async function selectOpenings(intervals: CalendarSelection[]) {
  resetOpeningForm();
  message.value = "";
  openingDrafts.value = intervals.map(({ start, end }) => ({ start: localInput(start), end: localInput(end) }));
  openingEditorOpen.value = true;
  await nextTick();
  document.getElementById("opening-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function addOpeningManually() {
  resetOpeningForm();
  message.value = "";
  openingDrafts.value = [{ start: "", end: "" }];
  openingEditorOpen.value = true;
}

async function saveOpening() {
  if (!openingId.value) {
    const ranges = openingDrafts.value.map(({ start, end }) => ({ start: parseLocalOpeningTime(start), end: parseLocalOpeningTime(end) }));
    if (!ranges.length || ranges.some(({ start, end }) => !start || !end || start >= end || new Date(end) <= new Date())) {
      return showMessage("Enter a valid time range that has not ended for each opening.", "error");
    }
    const sorted = ranges.map(({ start, end }) => ({ start: start!, end: end! })).sort((a, b) => a.start.localeCompare(b.start));
    if (sorted.some((range, index) => index > 0 && sorted[index - 1]!.end > range.start)) {
      return showMessage("Your selected openings cannot overlap.", "error");
    }
    busy.value = true;
    let saved = 0;
    try {
      for (const range of ranges) {
        const created = await api.openings.create({ start: range.start!, end: range.end! });
        if ("error" in created) {
          await refreshOpenings();
          return showMessage(`${saved ? `${saved} opening${saved === 1 ? "" : "s"} saved. ` : ""}${openingError(created.error)}`, "error");
        }
        saved++;
        searched.value = false;
        openingDrafts.value.shift();
        if (openingAudiences.value.length > 0) {
          const shared = await api.openings.publish({ opening: created.opening, audiences: openingAudiences.value });
          if ("error" in shared) {
            await refreshOpenings();
            if (!openingDrafts.value.length) resetOpeningForm();
            return showMessage(`${saved} opening${saved === 1 ? "" : "s"} saved; the last was saved privately because sharing failed. ${openingError(shared.error)}`, "error");
          }
        }
      }
      resetOpeningForm();
      await refreshOpenings();
      searched.value = false;
      showMessage(`${saved} opening${saved === 1 ? "" : "s"} saved.`, "success");
    } catch {
      await refreshOpenings();
      showMessage(`${saved ? `${saved} opening${saved === 1 ? "" : "s"} saved. ` : ""}OpenTime could not reach the server. Check your calendar before retrying.`, "error");
    } finally { busy.value = false; }
    return;
  }
  const previous = openings.value.find((item) => item.opening === openingId.value);
  const start = previous && openingStart.value === localInput(previous.start) ? previous.start : parseLocalOpeningTime(openingStart.value);
  const end = previous && openingEnd.value === localInput(previous.end) ? previous.end : parseLocalOpeningTime(openingEnd.value);
  if (!start || !end || start >= end || new Date(end) <= new Date()) {
    return showMessage("Enter a valid time range that has not ended.", "error");
  }
  busy.value = true;
  try {
    const result = await api.openings.revise({ opening: openingId.value, start, end, audiences: openingAudiences.value });
    if ("error" in result) return showMessage(openingError(result.error), "error");
    showMessage("Opening updated.", "success");
    resetOpeningForm();
    await refreshOpenings();
    searched.value = false;
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function withdrawOpening(opening: string) {
  if (!window.confirm("Withdraw this opening from every group?")) return;
  busy.value = true;
  try {
    const result = await api.openings.withdraw({ opening });
    if ("error" in result) return showMessage(openingError(result.error), "error");
    if (openingId.value === opening) resetOpeningForm();
    await refreshOpenings();
    searched.value = false;
    showMessage("Opening withdrawn.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function findOverlap() {
  const from = absoluteTime(searchFrom.value);
  const to = absoluteTime(searchTo.value);
  if (!searchGroup.value || !from || !to || from >= to || !Number.isFinite(searchDuration.value) || searchDuration.value <= 0) {
    return showMessage("Choose a group, valid range, and positive duration.", "error");
  }
  if (searchScope.value === "selected" && !searchInvitees.value.length) {
    return showMessage("Choose at least one other member to search with you.", "error");
  }
  busy.value = true;
  try {
    const search = { group: searchGroup.value, from, to, duration: searchDuration.value };
    const selected = searchScope.value === "selected";
    const result = selected
      ? await api.openings["selected-overlap"]({ ...search, invitees: searchInvitees.value })
        .then((response) => "error" in response ? response : { ...response, suggestions: [] })
      : await api.openings.overlap(search);
    if ("error" in result) {
      if (selected && result.error === "FORBIDDEN") {
        await refreshGroups();
        await loadRoster(search.group);
        searchInvitees.value = searchInvitees.value.filter((user) => searchMembers.value.some((member) => member.user === user));
        return showMessage("Group membership changed. Check the group and selected people, then search again.", "error");
      }
      return showMessage(openingError(result.error), "error");
    }
    overlaps.value = result.overlaps;
    suggestions.value = result.suggestions;
    searched.value = true;
    showMessage("Shared times updated.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function refreshGroups() {
  const result = await api.groups.list();
  if ("error" in result) {
    groups.value = [];
    showMessage(groupError(result.error), "error");
  } else {
    groups.value = result.groups;
  }
}

function clearAccount() {
  currentUsername.value = "";
  currentUser.value = "";
  groups.value = [];
  openings.value = [];
  resetOpeningForm();
  gatheringRefreshId++;
  gatherings.value = [];
  confirmationReview.value = null;
  rosters.value = {};
  proposalOverlap.value = "";
  searchInvitees.value = [];
  searchGroup.value = "";
  searchScope.value = "everyone";
  notices.value = [];
}

// Any protected request answered 401 means the session expired or was revoked: return to sign-in.
function handleSessionEnded() {
  if (!currentUser.value) return;
  clearAccount();
  message.value = "";
  sessionNotice.value = "Your session ended after 30 minutes. Sign in again to continue.";
}

async function handleSignedIn() {
  sessionNotice.value = "";
  message.value = "";
  await refreshAccount();
}

async function refreshAccount() {
  try {
    const result = await api.auth.current();
    currentUsername.value = "error" in result ? "" : result.username;
    currentUser.value = "error" in result ? "" : result.user;
    if (currentUser.value) await Promise.all([refreshGroups(), refreshOpenings(), refreshGatherings(), refreshNotices()]);
  } catch {
    clearAccount();
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    loading.value = false;
  }
  if (currentUser.value) await scrollToDestination();
}

async function createGroup() {
  if (!groupName.value.trim()) return showMessage("Enter a group name.", "error");
  busy.value = true;
  try {
    const result = await api.groups.create({ name: groupName.value.trim() });
    if ("error" in result) return showMessage(groupError(result.error), "error");
    groupName.value = "";
    await refreshGroups();
    showMessage("Group created.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function invite(group: string) {
  const username = inviteNames.value[group]?.trim();
  if (!username) return showMessage("Enter a username to invite.", "error");
  busy.value = true;
  try {
    const result = await api.groups.invite({ group, username });
    if ("error" in result) return showMessage(groupError(result.error), "error");
    inviteNames.value[group] = "";
    showMessage(`Invitation sent to ${username}.`, "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function respondToInvite(group: string, action: "accept" | "decline") {
  busy.value = true;
  try {
    const result = action === "accept" ? await api.groups.accept({ group }) : await api.groups.decline({ group });
    if ("error" in result) return showMessage(groupError(result.error), "error");
    await refreshGroups();
    showMessage(action === "accept" ? "You joined the group." : "Invitation declined.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

function joinPath(value: string): string | null {
  try {
    const url = new URL(value.trim(), location.origin);
    return url.origin === location.origin && /^\/join\/[0-9a-f-]{36}$/.test(url.pathname) ? url.pathname : null;
  } catch { return null; }
}

async function joinGroup() {
  const url = joinPath(joinInput.value);
  if (!url) return showMessage("Enter an OpenTime group invitation link.", "error");
  busy.value = true;
  try {
    const result = await api.groups.join({ url });
    if ("error" in result) return showMessage(groupError(result.error), "error");
    joinInput.value = "";
    if (location.pathname.startsWith("/join/")) history.replaceState({}, "", `/${location.hash}`);
    await refreshGroups();
    showMessage("You joined the group.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function showLink(group: string) {
  busy.value = true;
  try {
    const result = await api.groups.link({ group });
    if ("error" in result) return showMessage(groupError(result.error), "error");
    joinLinks.value[group] = new URL(result.url, location.origin).href;
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function changeMembership(group: string, action: "leave" | "remove" | "close") {
  busy.value = true;
  try {
    const username = removeNames.value[group]?.trim();
    if (action === "remove" && !username) return showMessage("Enter a username to remove.", "error");
    const result = action === "leave" ? await api.groups.leave({ group })
      : action === "close" ? await api.groups.close({ group })
      : await api.groups.remove({ group, username: username! });
    if ("error" in result) return showMessage(groupError(result.error), "error");
    removeNames.value[group] = "";
    await refreshGroups();
    showMessage(action === "leave" ? "You left the group." : action === "close" ? "Group closed." : "Member removed.", "success");
  } catch { showMessage("OpenTime could not reach the server. Try again.", "error"); }
  finally { busy.value = false; }
}

async function signOut() {
  busy.value = true;
  try {
    const result = await api.auth["sign-out"]();
    // An already-expired session is effectively signed out, so only other errors are failures.
    if ("error" in result && result.error !== "UNAUTHORIZED") {
      showMessage("Could not sign out. Try again.", "error");
      return;
    }
    clearAccount();
    sessionNotice.value = "";
    message.value = "";
  } catch {
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  window.addEventListener("hashchange", handleLocationChange);
  window.addEventListener("popstate", handleLocationChange);
  stopSessionWatch = onSessionEnded(handleSessionEnded);
  void refreshAccount();
  window.addEventListener("focus", refreshVisibleGatherings);
  document.addEventListener("visibilitychange", refreshVisibleGatherings);
  refreshTimer = setInterval(() => {
    if (currentUser.value) void refreshNotices().catch(() => {});
    refreshVisibleGatherings();
  }, 5_000);
});
onUnmounted(() => {
  window.removeEventListener("hashchange", handleLocationChange);
  window.removeEventListener("popstate", handleLocationChange);
  stopSessionWatch?.();
  window.removeEventListener("focus", refreshVisibleGatherings);
  document.removeEventListener("visibilitychange", refreshVisibleGatherings);
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :signed-in="!!currentUsername" :username="currentUsername" :active="activeSection" :unread="unreadNotices" :busy="busy"
      @navigate="navigate" @sign-out="signOut"
    />
    <main class="content">
      <template v-if="currentUsername">
        <p class="eyebrow">Make time together</p>
        <h1>Find an opening. Make a plan.</h1>
        <p class="intro">Share when you are free with chosen groups, find a time that works, and decide together whether to meet.</p>
      </template>

      <p v-if="message && !(currentUsername && activeSection === 'openings')" class="notice" :class="messageKind" role="status">{{ message }}</p>
      <p v-if="loading">Checking your account…</p>
      <section v-else-if="currentUsername" class="signed-in">
        <div class="account-heading"><h2>Welcome, {{ currentUsername }}</h2></div>
        <NoticesPanel
          v-show="activeSection === 'notices'" id="section-notices" :notices="notices" :groups="groups" :gatherings="gatherings"
          :busy="busy" @open="openNotice" @mark-all-read="markAllNoticesRead"
        />
        <div v-show="activeSection === 'groups'" class="group-layout" id="section-groups">
          <section class="status-panel">
            <h3>Your groups</h3>
            <p v-if="groups.length === 0">No groups yet. Create one or use an invitation link.</p>
            <ul v-else class="group-list">
              <li v-for="group in groups" :id="`destination-${group.group}`" :key="group.group" class="group-card">
                <div class="group-heading"><strong>{{ group.name }}</strong><span>{{ group.membership === "PENDING" ? "Invitation pending" : `${group.memberCount} member${group.memberCount === 1 ? '' : 's'}` }}</span></div>
                <div v-if="group.membership === 'PENDING'" class="button-row">
                  <button type="button" :disabled="busy" @click="respondToInvite(group.group, 'accept')">Accept invitation</button>
                  <button type="button" class="secondary" :disabled="busy" @click="respondToInvite(group.group, 'decline')">Decline</button>
                </div>
                <template v-else-if="group.owner === currentUser">
                  <form @submit.prevent="invite(group.group)">
                    <label :for="`invite-${group.group}`">Invite by username</label>
                    <input :id="`invite-${group.group}`" v-model="inviteNames[group.group]" autocomplete="off" :disabled="busy" />
                    <button type="submit" :disabled="busy">Invite</button>
                  </form>
                  <button type="button" class="secondary" :disabled="busy" @click="showLink(group.group)">Show join link</button>
                  <label v-if="joinLinks[group.group]" :for="`link-${group.group}`">Share this link</label>
                  <input v-if="joinLinks[group.group]" :id="`link-${group.group}`" :value="joinLinks[group.group]" readonly @focus="($event.target as HTMLInputElement).select()" />
                  <details class="group-controls"><summary>Manage group</summary>
                    <form @submit.prevent="changeMembership(group.group, 'remove')">
                      <label :for="`remove-${group.group}`">Remove by username</label>
                      <input :id="`remove-${group.group}`" v-model="removeNames[group.group]" autocomplete="off" :disabled="busy" />
                      <button type="submit" class="secondary" :disabled="busy">Remove</button>
                    </form>
                    <button type="button" class="secondary" :disabled="busy" @click="changeMembership(group.group, 'close')">Close group</button>
                  </details>
                </template>
                <button v-else type="button" class="secondary" :disabled="busy" @click="changeMembership(group.group, 'leave')">Leave group</button>
              </li>
            </ul>
          </section>
          <div class="group-actions">
            <section class="status-panel">
              <h3>Create a group</h3>
              <form @submit.prevent="createGroup">
                <label for="group-name">Group name</label>
                <input id="group-name" v-model="groupName" maxlength="80" :disabled="busy" required />
                <button type="submit" :disabled="busy">Create group</button>
              </form>
            </section>
            <section class="status-panel">
              <h3>Join with a link</h3>
              <p>Joining is your choice. Opening a link does not add you to a group.</p>
              <form @submit.prevent="joinGroup">
                <label for="join-link">Invitation link</label>
                <input id="join-link" v-model="joinInput" type="url" placeholder="https://…/join/…" :disabled="busy" required />
                <button type="submit" :disabled="busy">Join group</button>
              </form>
            </section>
          </div>
        </div>
        <div v-show="activeSection === 'openings'" class="opening-layout" id="section-openings">
          <p v-if="message && !openingEditorOpen" class="notice" :class="messageKind" role="status">{{ message }}</p>
          <WeeklyCalendar :openings="openings" :busy="busy" @select="selectOpenings" @edit="editOpening" @error="showMessage($event, 'error')" />
          <button type="button" class="secondary manual-opening" :disabled="busy" @click="addOpeningManually">Add an opening with exact times</button>
          <section v-if="openingEditorOpen" class="status-panel opening-editor" id="opening-form">
            <h3>{{ openingId ? "Opening details" : "Review your openings" }}</h3>
            <p>{{ selectedOpeningEnded ? "This opening has ended. You can withdraw it from your calendar." : "Review the times and choose which groups can see them." }}</p>
            <p v-if="message" class="notice" :class="messageKind" role="status">{{ message }}</p>
            <form @submit.prevent="saveOpening">
              <div v-if="openingId" class="time-fields">
                <div><label for="opening-start">From</label><input id="opening-start" v-model="openingStart" type="datetime-local" :disabled="busy || selectedOpeningEnded" required /></div>
                <div><label for="opening-end">Until</label><input id="opening-end" v-model="openingEnd" type="datetime-local" :disabled="busy || selectedOpeningEnded" required /></div>
              </div>
              <div v-for="(draft, index) in openingDrafts" v-else :key="index" class="opening-draft">
                <strong>Opening {{ index + 1 }}</strong>
                <div class="time-fields">
                  <div><label :for="`opening-start-${index}`">From</label><input :id="`opening-start-${index}`" v-model="draft.start" type="datetime-local" :disabled="busy" required /></div>
                  <div><label :for="`opening-end-${index}`">Until</label><input :id="`opening-end-${index}`" v-model="draft.end" type="datetime-local" :disabled="busy" required /></div>
                </div>
                <button v-if="openingDrafts.length > 1" type="button" class="secondary" :disabled="busy" @click="openingDrafts.splice(index, 1)">Remove opening {{ index + 1 }}</button>
              </div>
              <fieldset v-if="!selectedOpeningEnded" class="group-choices">
                <legend>Share with groups</legend>
                <p v-if="shareableGroups.length === 0">Join a group to share this opening. You can save it privately now.</p>
                <template v-else>
                  <label class="check-row select-all-row"><input type="checkbox" :checked="allOpeningGroupsSelected" :disabled="busy" @change="openingAudiences = ($event.target as HTMLInputElement).checked ? shareableGroups.map((group) => group.group) : []" />Select all current groups</label>
                </template>
                <label v-for="group in shareableGroups" :key="group.group" class="check-row">
                  <input v-model="openingAudiences" type="checkbox" :value="group.group" :disabled="busy" />{{ group.name }}
                </label>
                <p v-if="shareableGroups.length" class="field-hint">Only selected groups can use this free time. Members can include you in smaller searches and infer when your shared time overlaps theirs. New groups are not added automatically.</p>
              </fieldset>
              <div class="button-row">
                <button v-if="!selectedOpeningEnded" type="submit" :disabled="busy">{{ openingId ? "Save changes" : `Save ${openingDrafts.length === 1 ? "opening" : "openings"}` }}</button>
                <button v-if="openingId" type="button" class="secondary" :disabled="busy" @click="withdrawOpening(openingId)">Withdraw opening</button>
                <button type="button" class="secondary" :disabled="busy" @click="resetOpeningForm">Cancel</button>
              </div>
            </form>
          </section>
        </div>
        <SharedCalendar v-show="activeSection === 'shared-time'" :active="activeSection === 'shared-time'" :groups="groups" :busy="busy" @propose="proposeFromCalendar" />
        <section v-show="activeSection === 'shared-time'" class="status-panel overlap-panel" id="section-shared-time">
          <h3>Find time for selected people</h3>
          <p>Find a time for the whole group or choose who needs to be there.</p>
          <form @submit.prevent="findOverlap">
            <div class="search-fields">
              <div><label for="search-group">Group</label><select id="search-group" v-model="searchGroup" :disabled="busy" required><option value="" disabled>Choose a group</option><option v-for="group in groups.filter((item) => item.membership === 'MEMBER')" :key="group.group" :value="group.group">{{ group.name }}</option></select></div>
              <div><label for="search-from">From</label><input id="search-from" v-model="searchFrom" type="datetime-local" :disabled="busy" required /></div>
              <div><label for="search-to">Until</label><input id="search-to" v-model="searchTo" type="datetime-local" :disabled="busy" required /></div>
              <div><label for="search-duration">At least (minutes)</label><input id="search-duration" v-model.number="searchDuration" type="number" min="1" step="1" :disabled="busy" required /></div>
            </div>
            <fieldset class="group-choices">
              <legend>Who needs to be there?</legend>
              <label class="check-row"><input v-model="searchScope" type="radio" value="everyone" :disabled="busy" /> Everyone in the group</label>
              <label class="check-row"><input v-model="searchScope" type="radio" value="selected" :disabled="busy" /> You and selected members</label>
              <template v-if="searchScope === 'selected'">
                <p class="field-hint">You're included automatically. Choose at least one other person.</p>
                <p v-if="!searchGroup">Choose a group to see its members.</p>
                <p v-else-if="!rosters[searchGroup]" role="status">Loading current members…</p>
                <p v-else-if="!searchMembers.length">This group has no other current members.</p>
                <label v-for="member in searchMembers" :key="member.user" class="check-row">
                  <input v-model="searchInvitees" type="checkbox" :value="member.user" :disabled="busy" />{{ member.username }}
                </label>
              </template>
            </fieldset>
            <button type="submit" :disabled="busy || (searchScope === 'selected' && !searchInvitees.length)">Find shared time</button>
          </form>
          <div v-if="searched" class="overlap-results" aria-live="polite">
            <h4>Suggested times</h4>
            <template v-if="overlaps.length === 0 && suggestions.length === 0">
              <p>{{ searchScope === 'selected' ? 'No shared time fits everyone you selected.' : 'No time fits at least two members for the requested duration.' }}</p>
              <p>Try a wider date range, a shorter duration, or a different set of people above.</p>
            </template>
            <p v-else-if="searchScope === 'selected'">Times that work for you and {{ searchInvitees.length }} selected {{ searchInvitees.length === 1 ? 'member' : 'members' }}.</p>
            <ul v-if="overlaps.length"><li v-for="interval in overlaps" :key="interval.start + interval.end">{{ localTime(interval.start) }} – {{ localTime(interval.end) }}
              <button type="button" class="secondary" :disabled="busy" @click="proposeFromOverlap(interval)">Propose this time</button>
            </li></ul>
            <template v-if="suggestions.length">
              <p>Best partial-group times. These are suggestions, not commitments. You can still invite someone who has no usable time; they decide whether to accept.</p>
              <ul><li v-for="interval in suggestions" :key="interval.start + interval.end">
                {{ localTime(interval.start) }} – {{ localTime(interval.end) }} · {{ interval.availableCount }} of {{ interval.totalCount }} members are available.
                No usable time: {{ interval.unavailable.map((member) => member.username).join(', ') }}.
                <button type="button" class="secondary" :disabled="busy" @click="proposeFromOverlap(interval)">Propose this time</button>
              </li></ul>
            </template>
          </div>
        </section>
        <div v-show="activeSection === 'gatherings'" class="gathering-layout" id="section-gatherings">
          <section class="status-panel" id="proposal-form">
            <h3>Propose a gathering</h3>
            <p>Choose current group members and specific details. A shared opening does not count as acceptance.</p>
            <form @submit.prevent="proposeGathering">
              <label for="proposal-group">Group</label>
              <select id="proposal-group" v-model="proposalGroup" :disabled="busy" required>
                <option value="" disabled>Choose a group</option>
                <option v-for="group in groups.filter((item) => item.membership === 'MEMBER')" :key="group.group" :value="group.group">{{ group.name }}</option>
              </select>
              <fieldset class="group-choices">
                <legend>Invite people</legend>
                <p v-if="proposalOverlap" class="field-hint">{{ proposalOverlap }} Each invitee still chooses whether to accept.</p>
                <p v-if="proposalGroup && (rosters[proposalGroup] ?? []).filter((member) => member.user !== currentUser).length === 0">This group needs another member before you can propose.</p>
                <label v-for="member in (rosters[proposalGroup] ?? []).filter((item) => item.user !== currentUser)" :key="member.user" class="check-row">
                  <input v-model="proposalInvitees" type="checkbox" :value="member.user" :disabled="busy" />{{ member.username }}
                </label>
              </fieldset>
              <label for="proposal-purpose">Purpose</label><input id="proposal-purpose" v-model="proposalPurpose" placeholder="e.g. watching a movie" :disabled="busy" required />
              <label for="proposal-activity">Activity</label><input id="proposal-activity" v-model="proposalActivity" placeholder="e.g. Star Wars" :disabled="busy" required />
              <label for="proposal-place">Place</label><input id="proposal-place" v-model="proposalPlace" placeholder="e.g. dorm lounge" :disabled="busy" required />
              <div class="time-fields">
                <div><label for="proposal-start">From</label><input id="proposal-start" v-model="proposalStart" type="datetime-local" :disabled="busy" required /></div>
                <div><label for="proposal-end">Until</label><input id="proposal-end" v-model="proposalEnd" type="datetime-local" :disabled="busy" required /></div>
              </div>
              <button type="submit" :disabled="busy">Send proposal</button>
            </form>
          </section>
          <section class="status-panel">
            <h3>Your gatherings</h3>
            <p v-if="gatherings.length === 0">No proposals or confirmed gatherings yet.</p>
            <ul v-else class="gathering-list">
              <li v-for="gathering in gatherings" :id="`destination-${gathering.gathering}`" :key="gathering.gathering" class="gathering-card">
                <div class="group-heading"><strong>{{ gathering.activity }}</strong><span>Version {{ gathering.number }} · {{ gathering.status.toLowerCase() }}</span></div>
                <p>{{ gathering.purpose }} · {{ gathering.place }}</p>
                <p>{{ localTime(gathering.start) }} – {{ localTime(gathering.end) }}</p>
                <p>Your response: {{ gathering.myResponse.toLowerCase() }}</p>
                <p>Accepted: {{ gathering.accepted.map((member) => memberName(gathering.context, member)).join(', ') }}</p>
                <p>Pending: {{ gathering.pending.length }} · Declined: {{ gathering.declined.length }}</p>
                <p v-if="gathering.status === 'CANCELLED'">This gathering was cancelled. Responses and earlier versions remain on record.</p>
                <div v-if="(gathering.status === 'PROPOSED' || gathering.status === 'CONFIRMED') && gathering.organizer !== currentUser && new Date(gathering.start) > new Date()" class="button-row">
                  <button v-if="gathering.myResponse !== 'ACCEPTED'" type="button" :disabled="busy" @click="respondGathering(gathering, 'accept')">{{ gathering.status === 'CONFIRMED' ? 'Join confirmed plan' : 'Accept details' }}</button>
                  <button v-if="gathering.myResponse === 'PENDING'" type="button" class="secondary" :disabled="busy" @click="respondGathering(gathering, 'decline')">Decline</button>
                  <button v-if="gathering.myResponse === 'ACCEPTED'" type="button" class="secondary" :disabled="busy" @click="withdrawFromGathering(gathering)">Withdraw</button>
                </div>
                <div v-if="gathering.organizer === currentUser && new Date(gathering.start) > new Date()" class="button-row">
                  <button v-if="gathering.status === 'PROPOSED' && gathering.accepted.length > 1 && confirmationReview?.gathering !== gathering.gathering" type="button" :disabled="busy" @click="confirmationReview = gathering">Review confirmation</button>
                  <button v-if="gathering.status === 'PROPOSED' || gathering.status === 'CONFIRMED'" type="button" class="secondary" :disabled="busy" @click="beginGatheringEdit(gathering)">Edit details</button>
                  <button v-if="gathering.status === 'PROPOSED' || gathering.status === 'CONFIRMED'" type="button" class="secondary" :disabled="busy" @click="cancelGathering(gathering)">Cancel gathering</button>
                </div>
                <fieldset v-if="confirmationReview?.gathering === gathering.gathering && new Date(gathering.start) > new Date()" class="group-choices">
                  <legend>Review confirmation</legend>
                  <div aria-live="polite">
                    <p v-if="reviewChanged(confirmationReview, gathering)">Responses or details changed. Review the current roster before confirming.</p>
                    <p><strong>Will be confirmed:</strong> {{ gathering.accepted.map((member) => memberName(gathering.context, member)).join(', ') }}</p>
                    <p><strong>Will stay pending:</strong> {{ gathering.pending.map((member) => memberName(gathering.context, member)).join(', ') || 'No one' }}</p>
                    <p v-if="gathering.accepted.length < 2">At least one invitee must accept before you can confirm.</p>
                  </div>
                  <div class="button-row">
                    <button v-if="reviewChanged(confirmationReview, gathering)" type="button" :disabled="busy || gathering.accepted.length < 2" @click="confirmationReview = gathering">Review updated roster</button>
                    <button v-else type="button" :disabled="busy || gathering.accepted.length < 2" @click="confirmGathering(gathering)">Confirm this roster</button>
                    <button type="button" class="secondary" :disabled="busy" @click="confirmationReview = null">Close review</button>
                  </div>
                </fieldset>
                <form v-if="gathering.organizer === currentUser && (gathering.status === 'PROPOSED' || gathering.status === 'CONFIRMED') && new Date(gathering.start) > new Date()" class="invite-extra" @submit.prevent="inviteToGathering(gathering)">
                  <label :for="`extra-${gathering.gathering}`">Invite another group member</label>
                  <select :id="`extra-${gathering.gathering}`" v-model="extraInvitees[gathering.gathering]" :disabled="busy" required>
                    <option value="" disabled>Choose a person</option>
                    <option v-for="member in (rosters[gathering.context] ?? []).filter((item) => item.user !== currentUser && (!gathering.invitees.includes(item.user) || gathering.declined.includes(item.user) || gathering.withdrawn.includes(item.user)))" :key="member.user" :value="member.user">{{ member.username }}</option>
                  </select>
                  <button type="submit" class="secondary" :disabled="busy">Send invitation</button>
                </form>
              </li>
            </ul>
            <button type="button" class="secondary" :disabled="busy" @click="refreshGatherings()">Refresh responses</button>
          </section>
        </div>
        <section v-if="editingGathering" v-show="activeSection === 'gatherings'" id="gathering-edit" class="status-panel gathering-edit-panel">
          <h3>Edit {{ editingGathering.activity }} · version {{ editingGathering.number }}</h3>
          <p>Saving creates a new version. Every invitee must respond to its details again. If this plan is confirmed, saving releases its current commitments until you reconfirm.</p>
          <form @submit.prevent="saveGatheringEdit">
            <label for="edit-purpose">Purpose</label><input id="edit-purpose" v-model="editPurpose" :disabled="busy" required />
            <label for="edit-activity">Activity</label><input id="edit-activity" v-model="editActivity" :disabled="busy" required />
            <label for="edit-place">Place</label><input id="edit-place" v-model="editPlace" :disabled="busy" required />
            <div class="time-fields">
              <div><label for="edit-start">From</label><input id="edit-start" v-model="editStart" type="datetime-local" :disabled="busy" required /></div>
              <div><label for="edit-end">Until</label><input id="edit-end" v-model="editEnd" type="datetime-local" :disabled="busy" required /></div>
            </div>
            <div class="button-row"><button type="submit" :disabled="busy">Save new version</button><button type="button" class="secondary" :disabled="busy" @click="cancelGatheringEdit">Cancel edit</button></div>
          </form>
        </section>
      </section>
      <AuthPanel v-else :notice="sessionNotice" @signed-in="handleSignedIn" />
    </main>
  </div>
</template>
