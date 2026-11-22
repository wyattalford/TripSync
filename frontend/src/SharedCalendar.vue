<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { api } from "./api.ts";
import { addDays, parseLocalOpeningTime, selectedIntervals, startOfWeek } from "./calendar.ts";
import { selectedOverlapCalendar, sharedDaySegments, sharedDetails, type CalendarData, type CountInterval, type SharedSegment } from "./sharedCalendar.ts";

const props = defineProps<{ groups: { group: string; name: string; membership: string }[]; currentUser: string; busy: boolean; active: boolean }>();
const emit = defineEmits<{ propose: [group: string, interval: CountInterval, invitees: string[]] }>();
const group = ref("");
const scope = ref<"everyone" | "selected">("everyone");
const invitees = ref<string[]>([]);
const members = ref<{ user: string; username: string }[] | null>(null);
const membersError = ref("");
const membersNotice = ref("");
const week = ref(startOfWeek(new Date()));
const from = ref("");
const to = ref("");
const duration = ref("");
const everyone = ref(false);
const data = ref<CalendarData | null>(null);
const loading = ref(false);
const loadError = ref("");
const selected = ref<ReturnType<typeof sharedDetails> | null>(null);
const detailsDialog = ref<HTMLDialogElement | null>(null);
const days = computed(() => Array.from({ length: 7 }, (_, index) => addDays(week.value, index)));
const slots = Array.from({ length: 48 }, (_, index) => index);
const transitionSlots = computed(() => days.value.map((_, day) => slots.map((slot) => !selectedIntervals(week.value, day, day, slot, slot))));
const weekLabel = computed(() => `${days.value[0]!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${days.value[6]!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
const minutes = computed(() => duration.value === "" ? null : Number(duration.value));
const selectedReady = computed(() => scope.value !== "selected" || (
  members.value !== null && invitees.value.length > 0
  && invitees.value.every((user) => members.value?.some((member) => member.user === user))
));
const scopeError = computed(() => {
  const start = from.value ? parseLocalOpeningTime(from.value) : null;
  const end = to.value ? parseLocalOpeningTime(to.value) : null;
  if ((from.value && !start) || (to.value && !end) || (start && end && start >= end)) return "Enter a valid start and end, with the start before the end.";
  if (minutes.value !== null && (!Number.isSafeInteger(minutes.value) || minutes.value <= 0)) return "Enter a positive whole number of minutes.";
  return "";
});
const segments = computed(() => data.value ? days.value.map((day) => sharedDaySegments(data.value!, day, {
  from: from.value ? Date.parse(parseLocalOpeningTime(from.value)!) : -Infinity,
  to: to.value ? Date.parse(parseLocalOpeningTime(to.value)!) : Infinity,
  duration: minutes.value, everyone: scope.value === "selected" || everyone.value,
})) : []);
let request = 0;
let membersRequest = 0;

watch(group, () => { invitees.value = []; }, { flush: "sync" });

async function loadMembers() {
  const id = ++membersRequest;
  const requestedGroup = group.value;
  members.value = null;
  membersError.value = "";
  membersNotice.value = "";
  if (!props.active || !requestedGroup || scope.value !== "selected") return;
  try {
    const result = await api.groups.members({ group: requestedGroup });
    if (id !== membersRequest || !props.active || group.value !== requestedGroup || scope.value !== "selected") return;
    if ("error" in result) {
      membersError.value = result.error === "UNAUTHORIZED" ? "Your session ended. Sign in again."
        : "Could not load current group members. Please try again.";
      return;
    }
    members.value = result.accounts.filter((member) => member.user !== props.currentUser);
    const current = invitees.value.filter((user) => members.value?.some((member) => member.user === user));
    if (current.length !== invitees.value.length) {
      invitees.value = current;
      membersNotice.value = "Some selected people are no longer group members. Review your selection.";
    }
  } catch {
    if (id === membersRequest && props.active && group.value === requestedGroup && scope.value === "selected") {
      membersError.value = "OpenTime could not reach the server. Try again.";
    }
  }
}

watch([group, scope, () => props.active], loadMembers, { immediate: true });

watch([group, week, minutes, scope, invitees, selectedReady, () => props.active], async () => {
  const id = ++request;
  data.value = null;
  clearSelection();
  loadError.value = "";
  loading.value = false;
  if (!props.active || !group.value || !selectedReady.value || (minutes.value !== null && (!Number.isSafeInteger(minutes.value) || minutes.value <= 0))) return;
  const requestedWeek = week.value.getTime();
  const requestedDuration = minutes.value;
  const requestedScope = scope.value;
  const requestedGroup = group.value;
  const requestedInvitees = [...invitees.value];
  const isCurrent = () => id === request && props.active && group.value === requestedGroup && week.value.getTime() === requestedWeek
    && minutes.value === requestedDuration && scope.value === requestedScope
    && (requestedScope !== "selected" || (invitees.value.length === requestedInvitees.length
      && invitees.value.every((user, index) => user === requestedInvitees[index])));
  const padding = (requestedDuration ?? 1) * 60_000;
  const start = new Date(requestedWeek - padding);
  const end = new Date(addDays(week.value, 7).getTime() + padding);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getUTCFullYear() < 0 || end.getUTCFullYear() > 9999) {
    loadError.value = "That duration is too large to display.";
    return;
  }
  loading.value = true;
  try {
    const search = { group: requestedGroup, from: start.toISOString(), to: end.toISOString(), duration: requestedDuration ?? 1 };
    const result = requestedScope === "selected"
      ? await api.openings["selected-overlap"]({ ...search, invitees: requestedInvitees })
      : await api.openings.calendar(search);
    if (!isCurrent()) return;
    if ("error" in result) {
      loadError.value = result.error === "FORBIDDEN" ? "Group membership changed. Check the group and selected people, then retry."
        : result.error === "UNAUTHORIZED" ? "Your session ended. Sign in again."
          : "Could not load a consistent availability calendar. Please try again.";
    } else data.value = "overlaps" in result ? selectedOverlapCalendar(result.overlaps, requestedInvitees.length + 1) : result;
  } catch {
    if (isCurrent()) loadError.value = "OpenTime could not reach the server. Try again.";
  } finally {
    if (isCurrent()) loading.value = false;
  }
}, { immediate: true });

watch([from, to, everyone], clearSelection);
watch(() => props.groups, (groups) => {
  if (group.value && !groups.some((item) => item.group === group.value && item.membership === "MEMBER")) group.value = "";
});

function slotTime(slot: number): string {
  return new Date(2000, 0, 1, 0, slot * 30).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function formatTime(time: number): string {
  const date = new Date(time);
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: date.getSeconds() || date.getMilliseconds() ? "medium" : "short" };
  return date.toLocaleString(undefined, options);
}
function label(segment: SharedSegment): string {
  const format: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  const action = segment.muted ? "Unavailable" : "View availability details";
  return `${action} from ${new Date(segment.start).toLocaleString(undefined, format)} to ${new Date(segment.end).toLocaleString(undefined, format)}`;
}
function clearSelection() {
  if (detailsDialog.value?.open) detailsDialog.value.close();
  selected.value = null;
}
async function selectSegment(segment: SharedSegment) {
  const dialog = detailsDialog.value;
  if (!data.value || !dialog || segment.muted) return;
  selected.value = sharedDetails(data.value, segment);
  await nextTick();
  if (selected.value && detailsDialog.value === dialog && !dialog.open) dialog.showModal();
}
function proposeSelected() {
  const proposal = selected.value?.proposal;
  if (!proposal) return;
  clearSelection();
  emit("propose", group.value, proposal, scope.value === "selected" ? [...invitees.value] : []);
}
function retryCalendar() {
  if (scope.value === "selected") void loadMembers();
  else week.value = new Date(week.value);
}
function segmentStyle(segment: SharedSegment) {
  const intensity = data.value?.total ? segment.count / data.value.total : 0;
  return {
    top: `${segment.startMinute / 1440 * 100}%`, height: `${(segment.endMinute - segment.startMinute) / 1440 * 100}%`,
    background: segment.muted ? "#dce1df" : `rgb(${Math.round(244 - intensity * 222)}, ${Math.round(250 - intensity * 147)}, ${Math.round(247 - intensity * 149)})`,
    color: !segment.muted && intensity > 0.6 ? "#fff" : "#173f38",
  };
}
</script>

<template>
  <section class="status-panel overlap-panel calendar-panel" aria-labelledby="shared-calendar-title">
    <h3 id="shared-calendar-title">Find shared time</h3>
    <p>Choose a group to see how many members are free. Darker teal means more members are available.</p>
    <div class="search-fields">
      <div><label for="search-group">Group</label><select id="search-group" v-model="group" :disabled="busy"><option value="">Choose a group</option><option v-for="item in groups.filter((item) => item.membership === 'MEMBER')" :key="item.group" :value="item.group">{{ item.name }}</option></select></div>
      <div><label for="search-from">From (optional)</label><input id="search-from" v-model="from" type="datetime-local" /></div>
      <div><label for="search-to">Until (optional)</label><input id="search-to" v-model="to" type="datetime-local" /></div>
      <div><label for="search-duration">At least (optional)</label><input id="search-duration" v-model="duration" type="number" min="1" step="1" placeholder="Duration in minutes" /></div>
    </div>
    <fieldset class="group-choices">
      <legend>Who needs to be there?</legend>
      <label class="check-row"><input v-model="scope" type="radio" value="everyone" :disabled="busy" /> Everyone in the group</label>
      <label class="check-row"><input v-model="scope" type="radio" value="selected" :disabled="busy" /> You and selected members</label>
      <template v-if="scope === 'selected'">
        <p class="field-hint">You're included automatically. Choose at least one other person.</p>
        <p v-if="!group">Choose a group to see its members.</p>
        <p v-else-if="membersError" class="shared-error" role="alert">{{ membersError }} <button type="button" class="secondary" @click="loadMembers">Retry</button></p>
        <p v-else-if="!members" role="status">Loading current members…</p>
        <template v-else>
          <p v-if="membersNotice" role="status">{{ membersNotice }}</p>
          <p v-if="!members.length">This group has no other current members.</p>
          <label v-for="member in members" :key="member.user" class="check-row"><input v-model="invitees" type="checkbox" :value="member.user" :disabled="busy" />{{ member.username }}</label>
        </template>
      </template>
    </fieldset>
    <label v-if="scope === 'everyone'" class="shared-filter"><input v-model="everyone" type="checkbox" /> Gray out times when not everyone is available</label>
    <p v-else class="calendar-hint">Only times that work for everyone selected can be chosen.</p>
    <p v-if="scopeError" class="shared-error" role="alert">{{ scopeError }}</p>
    <p v-if="!group" class="calendar-hint">Select a group to show its calendar.</p>
    <p v-else-if="scope === 'selected' && !selectedReady" class="calendar-hint">Choose at least one other current member to show the calendar.</p>
    <template v-else>
      <div class="calendar-heading shared-heading">
        <p>Times are in your local time zone. Gray times are outside your filters or in the past.</p>
        <div class="week-navigation" aria-label="Calendar week">
          <button type="button" class="secondary week-arrow" aria-label="Previous week" @click="week = addDays(week, -7)">&#8592;</button>
          <strong aria-live="polite">{{ weekLabel }}</strong>
          <button type="button" class="secondary week-arrow" aria-label="Next week" @click="week = addDays(week, 7)">&#8594;</button>
        </div>
      </div>
      <div v-if="scope === 'everyone'" class="calendar-legend"><span><i class="legend-swatch shared-low"></i> Fewer available</span><span><i class="legend-swatch shared-high"></i> More available</span><span><i class="legend-swatch shared-muted"></i> Filtered out</span></div>
      <div v-else class="calendar-legend"><span><i class="legend-swatch shared-high"></i> Everyone selected is available</span><span><i class="legend-swatch shared-muted"></i> Not a shared time</span></div>
      <p v-if="loading" class="calendar-hint" role="status">Loading availability…</p>
      <p v-else-if="loadError" class="shared-error" role="alert">{{ loadError }} <button type="button" class="secondary" @click="retryCalendar">Retry</button></p>
      <template v-else-if="data && !scopeError">
        <p v-if="scope === 'selected' && !data.timeline.length" class="calendar-hint" role="status">No shared time fits everyone selected in this week. Try another week or a shorter duration.</p>
        <p class="calendar-hint">Select an ungrayed time to see availability details. Qualifying times can be used to propose a gathering. Availability is not a commitment. Daylight saving transition slots are gray; verify proposal times carefully.</p>
        <div class="calendar-scroll" tabindex="0" aria-label="Weekly shared availability; scroll to see more times and days">
          <div class="calendar-grid">
            <div class="calendar-header">
              <div class="calendar-corner">Time</div>
              <div v-for="day in days" :key="day.toISOString()" class="calendar-day"><span>{{ day.toLocaleDateString(undefined, { weekday: "short" }) }}</span><strong>{{ day.toLocaleDateString(undefined, { month: "short", day: "numeric" }) }}</strong></div>
            </div>
            <div class="calendar-body">
              <div class="calendar-times"><div v-for="slot in slots" :key="slot" class="calendar-time" :class="{ half: slot % 2 }">{{ slotTime(slot) }}</div></div>
              <div v-for="(day, index) in days" :key="day.toISOString()" class="calendar-column shared-calendar-column">
                <div v-for="slot in slots" :key="slot" class="calendar-cell" :class="{ half: slot % 2, 'transition-slot': transitionSlots[index]?.[slot] }" :title="transitionSlots[index]?.[slot] ? 'Ambiguous or nonexistent local time' : undefined"></div>
                <button v-for="segment in segments[index]" :key="segment.start" type="button" class="shared-segment" :style="segmentStyle(segment)" :aria-label="label(segment)" :disabled="segment.muted" @click="selectSegment(segment)"></button>
              </div>
            </div>
          </div>
        </div>
        <dialog ref="detailsDialog" class="shared-details" aria-labelledby="shared-details-title" @close="selected = null" @keydown.esc.prevent.stop="clearSelection">
          <template v-if="selected">
            <h4 id="shared-details-title">Availability details</h4>
            <p>{{ formatTime(selected.start) }} – {{ formatTime(selected.end) }}</p>
            <p v-if="selected.count !== null">{{ selected.count }} of {{ data.total }} members available.</p>
            <p v-else>Availability data is not available for this time.</p>
            <p v-if="selected.proposal && (selected.proposal.availableCount !== selected.count || Date.parse(selected.proposal.start) !== selected.start || Date.parse(selected.proposal.end) !== selected.end)">{{ selected.proposal.availableCount }} members are continuously available from {{ formatTime(Date.parse(selected.proposal.start)) }} to {{ formatTime(Date.parse(selected.proposal.end)) }}.</p>
            <div class="button-row">
              <button v-if="selected.proposal" type="button" :disabled="busy" @click="proposeSelected">Propose this time</button>
              <button type="button" class="secondary" autofocus @click="clearSelection">Close</button>
            </div>
          </template>
        </dialog>
      </template>
    </template>
  </section>
</template>
