<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  contextLabel, noticeContext, parseDestination, relativeTime, splitInbox,
  type NamedGathering, type NamedGroup, type NoticeSummary,
} from "./notices.ts";

// The in-app inbox. The parent owns loading and navigation: it passes the notices plus the
// groups and gatherings the person can currently see (used to name what each notice is about),
// and handles `open` (mark read + go to destination) and `mark-all-read`.
const props = defineProps<{
  notices: NoticeSummary[];
  groups: NamedGroup[];
  gatherings: NamedGathering[];
  busy?: boolean;
}>();
const emit = defineEmits<{ open: [item: NoticeSummary]; "mark-all-read": [] }>();

const inbox = computed(() => splitInbox(props.notices));

// Re-render relative times ("5 min ago") once a minute.
const now = ref(new Date());
let ticker: ReturnType<typeof setInterval> | undefined;
onMounted(() => { ticker = setInterval(() => { now.value = new Date(); }, 60_000); });
onUnmounted(() => { if (ticker) clearInterval(ticker); });

function kind(item: NoticeSummary) {
  return parseDestination(item.destination)?.kind ?? "group";
}

function context(item: NoticeSummary) {
  return noticeContext(item.destination, props.groups, props.gatherings);
}

function contextLine(item: NoticeSummary) {
  return contextLabel(item, props.groups, props.gatherings);
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
</script>

<template>
  <section class="status-panel notices-panel" aria-labelledby="notices-heading">
    <header class="notices-header">
      <div class="notices-title">
        <h3 id="notices-heading">Notices</h3>
        <span v-if="inbox.unread.length" class="count-tag">{{ inbox.unread.length }} new</span>
      </div>
      <button
        v-if="inbox.unread.length" type="button" class="link-button" :disabled="props.busy"
        @click="emit('mark-all-read')"
      >Mark all as read</button>
    </header>

    <div v-if="props.notices.length === 0" class="empty">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <p class="empty-title">You're all caught up</p>
      <p class="empty-text">Group invitations and changes to your plans will show up here.</p>
    </div>

    <template v-for="section in ([['New', inbox.unread], ['Earlier', inbox.read]] as const)" :key="section[0]">
      <template v-if="section[1].length">
        <h4 v-if="inbox.unread.length" class="section-label">{{ section[0] }}</h4>
        <ul class="notice-items">
          <li v-for="item in section[1]" :key="item.notice">
            <button
              type="button" class="notice-row" :class="{ unread: !item.readAt }" :disabled="props.busy"
              :aria-label="`${item.readAt ? '' : 'Unread. '}${item.message}. ${context(item)}, ${relativeTime(item.createdAt, now)}. Open details.`"
              @click="emit('open', item)"
            >
              <span class="kind-icon" :class="kind(item)" aria-hidden="true">
                <svg v-if="kind(item) === 'group'" viewBox="0 0 24 24">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <svg v-else viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <span class="notice-body">
                <span class="notice-message">{{ item.message }}</span>
                <span class="notice-meta">
                  <template v-if="contextLine(item)">
                    <span class="notice-context">{{ contextLine(item) }}</span>
                    <span aria-hidden="true"> · </span>
                  </template>
                  <time :datetime="item.createdAt" :title="fullTime(item.createdAt)">{{ relativeTime(item.createdAt, now) }}</time>
                </span>
              </span>
              <span v-if="!item.readAt" class="unread-dot" aria-hidden="true" />
              <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
/* Colors follow design/visual-design-study.md: solid teal marks what needs attention (unread),
   pale teal fills, muted slate for supporting text. Unread is also shown by bold text and a dot,
   not color alone. */
.notices-panel { max-width: 46rem; padding: clamp(1rem, 4vw, 1.5rem); }
.notices-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; margin-bottom: .75rem; }
.notices-title { display: flex; align-items: center; gap: .6rem; }
.notices-title h3 { margin: 0; font-size: 1.35rem; }
.count-tag { padding: .15rem .55rem; border-radius: 999px; background: #0d6055; color: #fff; font-size: .8rem; font-weight: 700; }
.link-button { min-height: 2.25rem; margin: 0; padding: .25rem .2rem; background: none; color: #0d6055; font-weight: 700; text-decoration: underline; text-underline-offset: .15em; }
.link-button:hover { background: none; color: #084c43; }

.section-label { margin: 1rem 0 .4rem; color: #526970; font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.notice-items { display: grid; gap: .5rem; margin: 0; padding: 0; list-style: none; }

.notice-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: .8rem;
  width: 100%; min-height: 3.5rem; margin: 0; padding: .75rem .8rem;
  border: 1px solid #d6dfdb; border-radius: .5rem; background: #fff; color: #172f35; text-align: left;
}
.notice-row:hover { border-color: #82a89c; background: #f3f7f4; }
.notice-row.unread { border-color: #b6dfcf; background: #eef7f2; }
.notice-row.unread:hover { background: #e0eee9; }
.notice-row:disabled { cursor: progress; opacity: .7; }

.kind-icon { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: #e0eee9; color: #0d6055; }
.kind-icon.gathering { background: #fdf1cf; color: #6b5212; }
.kind-icon svg, .chevron, .empty svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.kind-icon svg { width: 1.1rem; height: 1.1rem; }

.notice-body { display: grid; gap: .2rem; min-width: 0; }
.notice-message { font-weight: 400; line-height: 1.35; overflow-wrap: anywhere; }
.unread .notice-message { font-weight: 700; }
.notice-meta { color: #526970; font-size: .85rem; overflow-wrap: anywhere; }
.notice-context { font-weight: 700; }

.unread-dot { width: .6rem; height: .6rem; border-radius: 50%; background: #0d6055; }
.chevron { width: 1.1rem; height: 1.1rem; color: #82a89c; }
.notice-row:not(.unread) .chevron { grid-column: 4; }

.empty { display: grid; justify-items: center; gap: .35rem; padding: 2rem 1rem; text-align: center; }
.empty svg { width: 2.25rem; height: 2.25rem; margin-bottom: .35rem; color: #82a89c; }
.empty-title { margin: 0; font-weight: 700; }
.empty-text { margin: 0; color: #526970; }

@media (max-width: 30rem) {
  .notice-row { gap: .6rem; padding: .7rem .6rem; }
  .kind-icon { width: 2rem; height: 2rem; }
  .chevron { display: none; }
}
</style>
