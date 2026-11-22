<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { api } from "./api.ts";
import { addDays, parseLocalOpeningTime, selectedIntervals, startOfWeek } from "./calendar.ts";
import { sharedDaySegments, sharedDetails, type CalendarData, type CountInterval, type SharedSegment } from "./sharedCalendar.ts";

const props = defineProps<{ groups: { group: string; name: string; membership: string }[]; busy: boolean; active: boolean }>();
const emit = defineEmits<{ propose: [group: string, interval: CountInterval] }>();
const group = ref("");
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
  duration: minutes.value, everyone: everyone.value,
})) : []);
let request = 0;

watch([group, week, minutes, () => props.active], async () => {
  const id = ++request;
  data.value = null;
  clearSelection();
  loadError.value = "";
  loading.value = false;
  if (!props.active || !group.value || (minutes.value !== null && (!Number.isSafeInteger(minutes.value) || minutes.value <= 0))) return;
  const padding = (minutes.value ?? 1) * 60_000;
  const start = new Date(week.value.getTime() - padding);
  const end = new Date(addDays(week.value, 7).getTime() + padding);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getUTCFullYear() < 0 || end.getUTCFullYear() > 9999) {
    loadError.value = "That duration is too large to display.";
    return;
  }
  loading.value = true;
  try {
    const result = await api.openings.calendar({ group: group.value, from: start.toISOString(), to: end.toISOString(), duration: minutes.value ?? 1 });
    if (id !== request) return;
    if ("error" in result) {
      loadError.value = result.error === "FORBIDDEN" ? "You are no longer a member of this group."
        : result.error === "UNAUTHORIZED" ? "Your session ended. Sign in again."
          : "Could not load a consistent availability calendar. Please try again.";
    } else data.value = result;
  } catch {
    if (id === request) loadError.value = "OpenTime could not reach the server. Try again.";
  } finally {
    if (id === request) loading.value = false;
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
  emit("propose", group.value, proposal);
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
    <label class="shared-filter"><input v-model="everyone" type="checkbox" /> Gray out times when not everyone is available</label>
    <p v-if="scopeError" class="shared-error" role="alert">{{ scopeError }}</p>
    <p v-if="!group" class="calendar-hint">Select a group to show its calendar.</p>
    <template v-else>
      <div class="calendar-heading shared-heading">
        <p>Times are in your local time zone. Gray times are outside your filters or in the past.</p>
        <div class="week-navigation" aria-label="Calendar week">
          <button type="button" class="secondary week-arrow" aria-label="Previous week" @click="week = addDays(week, -7)">&#8592;</button>
          <strong aria-live="polite">{{ weekLabel }}</strong>
          <button type="button" class="secondary week-arrow" aria-label="Next week" @click="week = addDays(week, 7)">&#8594;</button>
        </div>
      </div>
      <div class="calendar-legend"><span><i class="legend-swatch shared-low"></i> Fewer available</span><span><i class="legend-swatch shared-high"></i> More available</span><span><i class="legend-swatch shared-muted"></i> Filtered out</span></div>
      <p v-if="loading" class="calendar-hint" role="status">Loading availability…</p>
      <p v-else-if="loadError" class="shared-error" role="alert">{{ loadError }} <button type="button" class="secondary" @click="week = new Date(week)">Retry</button></p>
      <template v-else-if="data && !scopeError">
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
