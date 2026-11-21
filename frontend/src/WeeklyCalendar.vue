<script setup lang="ts">
import { computed, ref } from "vue";
import { addDays, dayOpeningBlocks, selectedIntervals, startOfWeek, type CalendarOpening, type CalendarSelection } from "./calendar.ts";

const props = defineProps<{ openings: CalendarOpening[]; busy: boolean }>();
const emit = defineEmits<{
  select: [intervals: CalendarSelection[]];
  edit: [opening: CalendarOpening];
  error: [message: string];
}>();

const week = ref(startOfWeek(new Date()));
const days = computed(() => Array.from({ length: 7 }, (_, index) => addDays(week.value, index)));
const slots = Array.from({ length: 48 }, (_, slot) => slot);
const blocks = computed(() => days.value.map((day) => dayOpeningBlocks(props.openings, day)));
const weekLabel = computed(() => `${days.value[0]!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${days.value[6]!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
const drag = ref<{ pointer: number; day: number; slot: number; endDay: number; endSlot: number } | null>(null);

function selected(day: number, slot: number): boolean {
  const current = drag.value;
  return !!current && day >= Math.min(current.day, current.endDay) && day <= Math.max(current.day, current.endDay)
    && slot >= Math.min(current.slot, current.endSlot) && slot <= Math.max(current.slot, current.endSlot);
}

function choose(firstDay: number, lastDay: number, firstSlot: number, lastSlot: number) {
  const intervals = selectedIntervals(week.value, firstDay, lastDay, firstSlot, lastSlot);
  if (!intervals) return emit("error", "This selection crosses a daylight saving time change. Enter the exact times manually instead.");
  emit("select", intervals);
}

function startDrag(event: PointerEvent, day: number, slot: number) {
  if (props.busy || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  drag.value = { pointer: event.pointerId, day, slot, endDay: day, endSlot: slot };
}

function moveDrag(event: PointerEvent) {
  if (!drag.value || drag.value.pointer !== event.pointerId) return;
  const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-calendar-day]");
  if (!column) return;
  const bounds = column.getBoundingClientRect();
  drag.value.endDay = Number(column.dataset.calendarDay);
  drag.value.endSlot = Math.max(0, Math.min(47, Math.floor((event.clientY - bounds.top) / bounds.height * 48)));
}

function endDrag(event: PointerEvent) {
  if (!drag.value || drag.value.pointer !== event.pointerId) return;
  const current = drag.value;
  drag.value = null;
  choose(current.day, current.endDay, current.slot, current.endSlot);
}

function slotTime(slot: number): string {
  return new Date(2000, 0, 1, 0, slot * 30).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function openingLabel(opening: CalendarOpening): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  const state = opening.audiences.length ? "Shared" : "Private";
  return `${state} opening: ${new Date(opening.start).toLocaleString(undefined, options)} to ${new Date(opening.end).toLocaleString(undefined, options)}`;
}

function openingTime(opening: CalendarOpening): string {
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${new Date(opening.start).toLocaleTimeString(undefined, options)}–${new Date(opening.end).toLocaleTimeString(undefined, options)}`;
}
</script>

<template>
  <section class="status-panel calendar-panel" aria-labelledby="calendar-title">
    <div class="calendar-heading">
      <div>
        <p class="calendar-kicker">Your schedule</p>
        <h3 id="calendar-title">Your free time</h3>
        <p>Drag across half-hour slots and days to select free time, then review and save. Select an opening to edit or share it.</p>
      </div>
      <div class="week-navigation" aria-label="Calendar week">
        <button type="button" class="secondary week-arrow" aria-label="Previous week" :disabled="busy" @click="week = addDays(week, -7)">&#8592;</button>
        <strong aria-live="polite">{{ weekLabel }}</strong>
        <button type="button" class="secondary week-arrow" aria-label="Next week" :disabled="busy" @click="week = addDays(week, 7)">&#8594;</button>
      </div>
    </div>
    <div class="calendar-legend"><span><i class="legend-swatch private-swatch"></i> Private</span><span><i class="legend-swatch shared-swatch"></i> Shared</span><span>Times are in your local time zone.</span></div>
    <p class="calendar-hint">Click and drag to select openings or manually enter them below. Edit opening details by selecting them on the calendar.</p>
    <div class="calendar-scroll" tabindex="0" aria-label="Weekly calendar; scroll to see more times and days">
      <div class="calendar-grid" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="drag = null">
        <div class="calendar-header">
          <div class="calendar-corner">Time</div>
          <div v-for="day in days" :key="day.toISOString()" class="calendar-day">
            <span>{{ day.toLocaleDateString(undefined, { weekday: "short" }) }}</span>
            <strong>{{ day.toLocaleDateString(undefined, { month: "short", day: "numeric" }) }}</strong>
          </div>
        </div>
        <div class="calendar-body">
          <div class="calendar-times">
            <div v-for="slot in slots" :key="slot" class="calendar-time" :class="{ half: slot % 2 }">{{ slotTime(slot) }}</div>
          </div>
          <div v-for="(day, dayIndex) in days" :key="day.toISOString()" class="calendar-column" :data-calendar-day="dayIndex">
            <div v-for="slot in slots" :key="slot" class="calendar-cell" :class="{ selecting: selected(dayIndex, slot), half: slot % 2 }">
              <button type="button" class="calendar-slot" :disabled="busy" :aria-label="`Select ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at ${slotTime(slot)}`" @pointerdown="startDrag($event, dayIndex, slot)" @click="$event.detail === 0 && choose(dayIndex, dayIndex, slot, slot)"></button>
            </div>
            <button v-for="block in blocks[dayIndex]" :key="block.opening.opening" type="button" class="calendar-opening" :class="{ shared: block.opening.audiences.length > 0, ended: new Date(block.opening.end) <= new Date() }" :style="{ top: `${block.startMinute / 1440 * 100}%`, height: `${(block.endMinute - block.startMinute) / 1440 * 100}%`, left: `${block.lane / block.lanes * 100}%`, width: `${100 / block.lanes}%` }" :disabled="busy" :aria-label="openingLabel(block.opening)" :title="openingLabel(block.opening)" @click="emit('edit', block.opening)"><span>{{ openingTime(block.opening) }}</span><span>{{ block.opening.audiences.length ? "Shared" : "Private" }}</span></button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
