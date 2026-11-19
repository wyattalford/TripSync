<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "./api.ts";

type Mode = "sign-in" | "register";
type GroupSummary = { group: string; name: string; owner: string; membership: string; memberCount: number };
type Opening = { opening: string; start: string; end: string; audiences: string[] };
type Interval = { start: string; end: string };
type PartialSuggestion = Interval & { availableCount: number; totalCount: number; unavailable: { user: string; username: string }[] };
type Member = { user: string; username: string };
type GatheringSummary = { gathering: string; organizer: string; context: string; version: string; number: number; purpose: string; activity: string; place: string; start: string; end: string; status: string; myResponse: string; invitees: string[]; accepted: string[]; pending: string[]; declined: string[]; withdrawn: string[]; attendees: string[] };
type NoticeSummary = { notice: string; message: string; destination: string; createdAt: string; readAt: string | null };
const mode = ref<Mode>("sign-in");
const username = ref("");
const password = ref("");
const currentUsername = ref("");
const currentUser = ref("");
const groups = ref<GroupSummary[]>([]);
const openings = ref<Opening[]>([]);
const openingId = ref("");
const openingStart = ref("");
const openingEnd = ref("");
const openingAudiences = ref<string[]>([]);
const shareableGroups = computed(() => groups.value.filter((group) => group.membership === "MEMBER"));
const allOpeningGroupsSelected = computed(() => shareableGroups.value.length > 0 && shareableGroups.value.every((group) => openingAudiences.value.includes(group.group)));
const searchGroup = ref("");
const searchFrom = ref("");
const searchTo = ref("");
const searchDuration = ref(60);
const overlaps = ref<Interval[]>([]);
const suggestions = ref<PartialSuggestion[]>([]);
const searched = ref(false);
const gatherings = ref<GatheringSummary[]>([]);
const notices = ref<NoticeSummary[]>([]);
let noticeRefreshTimer: ReturnType<typeof setInterval> | undefined;
const extraInvitees = ref<Record<string, string>>({});
const rosters = ref<Record<string, Member[]>>({});
const proposalGroup = ref("");
const proposalInvitees = ref<string[]>([]);
const proposalPurpose = ref("");
const proposalActivity = ref("");
const proposalPlace = ref("");
const proposalStart = ref("");
const proposalEnd = ref("");
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

function authError(error: string): string {
  if (error === "CONFLICT") return "That username is already registered.";
  if (error === "INVALID_REQUEST" && mode.value === "sign-in") return "The username or password is incorrect.";
  if (error === "INVALID_REQUEST") return "Enter a username and password.";
  if (error === "NETWORK_ERROR") return "OpenTime could not reach the server. Try again.";
  return "OpenTime could not complete that request. Try again.";
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

async function openNotice(item: NoticeSummary) {
  if (!item.readAt) {
    const result = await api.notices["mark-read"]({ notice: item.notice });
    if ("error" in result) return showMessage("Could not mark this notice read. Try again.", "error");
    await refreshNotices();
  }
  if (!/^\/(groups|gatherings)\/[0-9a-f-]{36}$/.test(item.destination)) return;
  history.pushState({}, "", item.destination);
  await Promise.all([refreshGroups(), refreshGatherings()]);
  await nextTick();
  const target = document.getElementById(`destination-${item.destination.split("/")[2]}`);
  if (target) target.scrollIntoView({ behavior: "smooth" });
  else showMessage("This item is no longer available to your account.", "error");
}

function memberName(group: string, user: string): string {
  return rosters.value[group]?.find((member) => member.user === user)?.username ?? (user === currentUser.value ? currentUsername.value : "Former member");
}

async function loadRoster(group: string) {
  if (!group) return;
  const result = await api.groups.members({ group });
  if ("error" in result) {
    showMessage(groupError(result.error), "error");
    rosters.value[group] = [];
  } else rosters.value[group] = result.accounts;
}

async function refreshGatherings() {
  const result = await api.gatherings.list();
  if ("error" in result) return showMessage(gatheringError(result.error), "error");
  gatherings.value = result.gatherings;
  await Promise.all([...new Set(result.gatherings.map((gathering) => gathering.context))].map((group) => loadRoster(group)));
}

function proposeFromOverlap(interval: Interval) {
  proposalGroup.value = searchGroup.value;
  proposalPurpose.value = "";
  proposalStart.value = localInput(interval.start);
  proposalEnd.value = localInput(interval.end);
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

async function confirmGathering(gathering: GatheringSummary) {
  busy.value = true;
  try {
    const result = await api.gatherings.confirm({ gathering: gathering.gathering, version: gathering.version, expectedAttendees: gathering.accepted });
    if ("error" in result) {
      await refreshGatherings();
      return showMessage(gatheringError(result.error), "error");
    }
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

watch(proposalGroup, (group) => { proposalInvitees.value = []; void loadRoster(group); });
watch([searchGroup, searchFrom, searchTo, searchDuration], () => {
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
  openingId.value = "";
  openingStart.value = "";
  openingEnd.value = "";
  openingAudiences.value = [];
}

function editOpening(opening: Opening) {
  openingId.value = opening.opening;
  openingStart.value = localInput(opening.start);
  openingEnd.value = localInput(opening.end);
  openingAudiences.value = opening.audiences.filter((id) => shareableGroups.value.some((group) => group.group === id));
  document.getElementById("opening-form")?.scrollIntoView({ behavior: "smooth" });
}

async function saveOpening() {
  const start = absoluteTime(openingStart.value);
  const end = absoluteTime(openingEnd.value);
  if (!start || !end || start >= end || new Date(end) <= new Date()) {
    return showMessage("Enter a valid time range that has not ended.", "error");
  }
  busy.value = true;
  try {
    if (openingId.value) {
      const result = await api.openings.revise({ opening: openingId.value, start, end, audiences: openingAudiences.value });
      if ("error" in result) return showMessage(openingError(result.error), "error");
      showMessage("Opening updated.", "success");
    } else {
      const created = await api.openings.create({ start, end });
      if ("error" in created) return showMessage(openingError(created.error), "error");
      if (openingAudiences.value.length > 0) {
        const shared = await api.openings.publish({ opening: created.opening, audiences: openingAudiences.value });
        if ("error" in shared) {
          await refreshOpenings();
          resetOpeningForm();
          return showMessage(`Opening saved privately, but sharing failed. ${openingError(shared.error)}`, "error");
        }
      }
      showMessage(openingAudiences.value.length ? "Opening shared with your selected groups." : "Private opening saved. You can share it later.", "success");
    }
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
  busy.value = true;
  try {
    const result = await api.openings.overlap({ group: searchGroup.value, from, to, duration: searchDuration.value });
    if ("error" in result) return showMessage(openingError(result.error), "error");
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

async function refreshAccount() {
  try {
    const result = await api.auth.current();
    currentUsername.value = "error" in result ? "" : result.username;
    currentUser.value = "error" in result ? "" : result.user;
    if (currentUser.value) await Promise.all([refreshGroups(), refreshOpenings(), refreshGatherings(), refreshNotices()]);
  } catch {
    currentUsername.value = "";
    currentUser.value = "";
    groups.value = [];
    openings.value = [];
    gatherings.value = [];
    notices.value = [];
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    loading.value = false;
  }
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
    if (location.pathname.startsWith("/join/")) history.replaceState({}, "", "/");
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

async function submitAccount() {
  const name = username.value.trim();
  if (!name || !password.value.trim()) {
    showMessage("Enter a username and password.", "error");
    return;
  }
  busy.value = true;
  message.value = "";
  try {
    if (mode.value === "register") {
      const registered = await api.auth.register({ username: name, password: password.value });
      if ("error" in registered) {
        showMessage(authError(registered.error), "error");
        return;
      }
    }
    const signedIn = await api.auth["sign-in"]({ username: name, password: password.value });
    if ("error" in signedIn) {
      showMessage(authError(signedIn.error), "error");
      return;
    }
    password.value = "";
    await refreshAccount();
    showMessage(mode.value === "register" ? "Account created." : "Signed in.", "success");
  } catch {
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  busy.value = true;
  try {
    const result = await api.auth["sign-out"]();
    if ("error" in result) {
      showMessage("Could not sign out. Try again.", "error");
      return;
    }
    currentUsername.value = "";
    currentUser.value = "";
    groups.value = [];
    openings.value = [];
    gatherings.value = [];
    notices.value = [];
    showMessage("Signed out.", "success");
  } catch {
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void refreshAccount().then(async () => {
    await nextTick();
    if (/^\/(groups|gatherings)\/[0-9a-f-]{36}$/.test(location.pathname)) {
      document.getElementById(`destination-${location.pathname.split("/")[2]}`)?.scrollIntoView();
    }
  });
  noticeRefreshTimer = setInterval(() => { if (currentUser.value) void refreshNotices(); }, 5_000);
});
onUnmounted(() => { if (noticeRefreshTimer) clearInterval(noticeRefreshTimer); });
</script>

<template>
  <div class="app-shell">
    <header class="site-header"><span class="wordmark">OpenTime</span></header>
    <main class="content">
      <p class="eyebrow">Make time together</p>
      <h1>Find an opening. Make a plan.</h1>
      <p class="intro">Share when you are free with chosen groups, find a time that works, and decide together whether to meet.</p>

      <p v-if="message" class="notice" :class="messageKind" role="status">{{ message }}</p>
      <p v-if="loading">Checking your account…</p>
      <section v-else-if="currentUsername" class="signed-in">
        <div class="account-heading"><h2>Welcome, {{ currentUsername }}</h2><button type="button" class="secondary" :disabled="busy" @click="signOut">Sign out</button></div>
        <nav class="task-nav" aria-label="OpenTime sections">
          <a href="#groups">Groups</a><a href="#openings">Your free time</a><a href="#shared-time">Find shared time</a><a href="#gatherings">Gatherings</a><a href="#notices">Notices</a>
        </nav>
        <section class="status-panel inbox-panel" id="notices">
          <div class="group-heading"><h3>Your notices</h3><span>{{ notices.filter((item) => !item.readAt).length }} unread</span></div>
          <p v-if="notices.length === 0">No notices yet.</p>
          <ul v-else class="notice-list">
            <li v-for="item in notices" :key="item.notice" :class="{ unread: !item.readAt }">
              <p>{{ item.message }}</p>
              <span>{{ localTime(item.createdAt) }} · {{ item.readAt ? 'Read' : 'Unread' }}</span>
              <button type="button" class="secondary" @click="openNotice(item)">Review current details</button>
            </li>
          </ul>
        </section>
        <div class="group-layout" id="groups">
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
        <div class="opening-layout" id="openings">
          <section class="status-panel" id="opening-form">
            <h3>{{ openingId ? "Revise your opening" : "Add an opening" }}</h3>
            <p>Add a time when you are free. You can use the same time with any groups you choose.</p>
            <form @submit.prevent="saveOpening">
              <div class="time-fields">
                <div><label for="opening-start">From</label><input id="opening-start" v-model="openingStart" type="datetime-local" :disabled="busy" required /></div>
                <div><label for="opening-end">Until</label><input id="opening-end" v-model="openingEnd" type="datetime-local" :disabled="busy" required /></div>
              </div>
              <fieldset class="group-choices">
                <legend>Share with groups</legend>
                <p v-if="shareableGroups.length === 0">Join a group to share this opening. You can save it privately now.</p>
                <template v-else>
                  <label class="check-row select-all-row"><input type="checkbox" :checked="allOpeningGroupsSelected" :disabled="busy" @change="openingAudiences = ($event.target as HTMLInputElement).checked ? shareableGroups.map((group) => group.group) : []" />Select all current groups</label>
                </template>
                <label v-for="group in shareableGroups" :key="group.group" class="check-row">
                  <input v-model="openingAudiences" type="checkbox" :value="group.group" :disabled="busy" />{{ group.name }}
                </label>
                <p v-if="shareableGroups.length" class="field-hint">Only selected groups can use this free time. New groups are not added automatically.</p>
              </fieldset>
              <div class="button-row">
                <button type="submit" :disabled="busy">{{ openingId ? "Save changes" : "Save opening" }}</button>
                <button v-if="openingId" type="button" class="secondary" :disabled="busy" @click="resetOpeningForm">Cancel edit</button>
              </div>
            </form>
          </section>
          <section class="status-panel">
            <h3>Your openings</h3>
            <p v-if="openings.length === 0">No openings yet. Add one to start finding time together.</p>
            <ul v-else class="opening-list">
              <li v-for="opening in openings" :key="opening.opening" class="opening-card">
                <strong>Free time</strong>
                <span>{{ localTime(opening.start) }} – {{ localTime(opening.end) }}</span>
                <span>{{ opening.audiences.length ? `Shared with ${opening.audiences.length} group${opening.audiences.length === 1 ? '' : 's'}` : 'Private' }}</span>
                <div class="button-row">
                  <button type="button" class="secondary" :disabled="busy || new Date(opening.end) <= new Date()" @click="editOpening(opening)">Edit</button>
                  <button type="button" class="secondary" :disabled="busy" @click="withdrawOpening(opening.opening)">Withdraw</button>
                </div>
              </li>
            </ul>
          </section>
        </div>
        <section class="status-panel overlap-panel" id="shared-time">
          <h3>Find shared time</h3>
          <p>Find free time shared with this group. If no time works for everyone, see when the most members are free.</p>
          <form @submit.prevent="findOverlap">
            <div class="search-fields">
              <div><label for="search-group">Group</label><select id="search-group" v-model="searchGroup" :disabled="busy" required><option value="" disabled>Choose a group</option><option v-for="group in groups.filter((item) => item.membership === 'MEMBER')" :key="group.group" :value="group.group">{{ group.name }}</option></select></div>
              <div><label for="search-from">From</label><input id="search-from" v-model="searchFrom" type="datetime-local" :disabled="busy" required /></div>
              <div><label for="search-to">Until</label><input id="search-to" v-model="searchTo" type="datetime-local" :disabled="busy" required /></div>
              <div><label for="search-duration">At least (minutes)</label><input id="search-duration" v-model.number="searchDuration" type="number" min="1" step="1" :disabled="busy" required /></div>
            </div>
            <button type="submit" :disabled="busy">Find shared time</button>
          </form>
          <div v-if="searched" class="overlap-results" aria-live="polite">
            <h4>Suggested times</h4>
            <p v-if="overlaps.length === 0 && suggestions.length === 0">No time fits at least two members for the requested duration.</p>
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
        <div class="gathering-layout" id="gatherings">
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
                  <button v-if="gathering.status === 'PROPOSED' && gathering.accepted.length > 1" type="button" :disabled="busy" @click="confirmGathering(gathering)">Confirm accepted roster</button>
                  <button v-if="gathering.status === 'PROPOSED' || gathering.status === 'CONFIRMED'" type="button" class="secondary" :disabled="busy" @click="beginGatheringEdit(gathering)">Edit details</button>
                  <button v-if="gathering.status === 'PROPOSED' || gathering.status === 'CONFIRMED'" type="button" class="secondary" :disabled="busy" @click="cancelGathering(gathering)">Cancel gathering</button>
                </div>
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
            <button type="button" class="secondary" :disabled="busy" @click="refreshGatherings">Refresh responses</button>
          </section>
        </div>
        <section v-if="editingGathering" id="gathering-edit" class="status-panel gathering-edit-panel">
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
      <section v-else class="status-panel">
        <div class="mode-switch" aria-label="Account action">
          <button type="button" :aria-pressed="mode === 'sign-in'" @click="mode = 'sign-in'; message = ''">Sign in</button>
          <button type="button" :aria-pressed="mode === 'register'" @click="mode = 'register'; message = ''">Register</button>
        </div>
        <h2>{{ mode === "sign-in" ? "Welcome back" : "Create an account" }}</h2>
        <form @submit.prevent="submitAccount">
          <label for="username">Username</label>
          <input id="username" v-model="username" name="username" autocomplete="username" required :disabled="busy" />
          <label for="password">Password</label>
          <input id="password" v-model="password" name="password" type="password" :autocomplete="mode === 'sign-in' ? 'current-password' : 'new-password'" required :disabled="busy" />
          <button type="submit" :disabled="busy">{{ busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account" }}</button>
        </form>
      </section>
    </main>
  </div>
</template>
