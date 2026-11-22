<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { badgeLabel } from "./notices.ts";
import { HOME_SECTION, NAV_ITEMS, linksFit, sectionHref, type Section } from "./nav.ts";

// Site header and main navigation. Links sit on the right while they fit beside the wordmark;
// otherwise a hamburger opens a full-height menu below the header. The parent owns routing:
// it receives `navigate` (and scrolls to the top) and `sign-out`.
const props = defineProps<{
  signedIn: boolean;
  username?: string;
  active: Section;
  unread: number;
  busy?: boolean;
}>();
const emit = defineEmits<{ navigate: [section: Section]; "sign-out": [] }>();

const open = ref(false);
const collapsed = ref(false);
const bar = ref<HTMLElement>();
const brand = ref<HTMLElement>();
const measure = ref<HTMLElement>();
const toggle = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const GAP = 32;

function updateFit() {
  if (!bar.value || !brand.value || !measure.value) return;
  const style = getComputedStyle(bar.value);
  const inner = bar.value.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  collapsed.value = !linksFit(inner, brand.value.offsetWidth, measure.value.scrollWidth, GAP);
}

let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(updateFit);
  if (bar.value) observer.observe(bar.value);
  document.addEventListener("keydown", onKeydown);
  void nextTick(updateFit);
});
onUnmounted(() => {
  observer?.disconnect();
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});

// Re-measure when the link contents change width (badge appears, account changes).
watch(() => [props.signedIn, props.unread, props.username], () => void nextTick(updateFit));
watch(collapsed, (isCollapsed) => { if (!isCollapsed) open.value = false; });
watch(() => props.signedIn, (signedIn) => { if (!signedIn) open.value = false; });
watch(open, async (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
  if (isOpen) {
    await nextTick();
    menu.value?.querySelector<HTMLElement>("a")?.focus();
  }
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    open.value = false;
    toggle.value?.focus();
  }
}

function go(event: MouseEvent, section: Section) {
  // Let modified clicks (new tab, etc.) behave normally.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  open.value = false;
  emit("navigate", section);
}

function signOut() {
  open.value = false;
  emit("sign-out");
}
</script>

<template>
  <header class="app-header">
    <div ref="bar" class="bar">
      <a ref="brand" class="brand" :href="signedIn ? sectionHref(HOME_SECTION) : '/'" @click="signedIn && go($event, HOME_SECTION)">
        <img class="brand-icon" src="/hourglass.svg" alt="" width="32" height="32" />
        <span>OpenTime</span>
      </a>

      <template v-if="signedIn">
        <nav v-show="!collapsed" class="inline-nav" aria-label="Main">
          <a
            v-for="item in NAV_ITEMS" :key="item.section" :href="sectionHref(item.section)"
            :aria-current="active === item.section ? 'page' : undefined" @click="go($event, item.section)"
          >
            {{ item.label }}
            <span v-if="item.section === 'notices' && unread" class="badge">
              <span class="visually-hidden">, </span>{{ badgeLabel(unread) }}<span class="visually-hidden"> unread</span>
            </span>
          </a>
          <button type="button" class="sign-out" :disabled="busy" @click="signOut">Sign out</button>
        </nav>

        <button
          v-show="collapsed" ref="toggle" type="button" class="menu-toggle"
          :aria-expanded="open" aria-controls="main-menu" :aria-label="open ? 'Close menu' : 'Open menu'" @click="open = !open"
        >
          <svg v-if="!open" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          <span v-if="unread && !open" class="toggle-dot"><span class="visually-hidden">{{ unread }} unread notifications</span></span>
        </button>

        <!-- Invisible copy of the inline links, used only to measure whether they fit. -->
        <div ref="measure" class="measure" aria-hidden="true">
          <span v-for="item in NAV_ITEMS" :key="item.section" class="measure-link">
            {{ item.label }}<span v-if="item.section === 'notices' && unread" class="badge">{{ badgeLabel(unread) }}</span>
          </span>
          <span class="sign-out measure-link">Sign out</span>
        </div>
      </template>
    </div>

    <div v-if="signedIn && collapsed && open" id="main-menu" ref="menu" class="menu-panel">
      <nav aria-label="Main">
        <ul>
          <li v-for="item in NAV_ITEMS" :key="item.section">
            <a :href="sectionHref(item.section)" :aria-current="active === item.section ? 'page' : undefined" @click="go($event, item.section)">
              <span>{{ item.label }}</span>
              <span v-if="item.section === 'notices' && unread" class="badge">
                <span class="visually-hidden">, </span>{{ badgeLabel(unread) }}<span class="visually-hidden"> unread</span>
              </span>
            </a>
          </li>
        </ul>
      </nav>
      <div class="menu-account">
        <p v-if="username">Signed in as <strong>{{ username }}</strong></p>
        <button type="button" class="sign-out" :disabled="busy" @click="signOut">Sign out</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* White bar like the cards; teal marks the current page (visual design study). The current
   page is also bold and has aria-current, so it does not rely on color alone. */
.app-header { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid #d6dfdb; }
.bar {
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: 2rem;
  height: 4rem; max-width: 64rem; margin: 0 auto; padding: 0 1.5rem;
  overflow: clip; overflow-clip-margin: .4rem; /* keeps the hidden measuring copy from widening the page */
}
.brand { display: inline-flex; flex: none; align-items: center; gap: .6rem; color: #0d6055; font-size: 1.25rem; font-weight: 800; text-decoration: none; }
.brand-icon { display: block; width: 2rem; height: 2rem; flex: none; }
.brand:focus-visible, a:focus-visible, button:focus-visible { outline: 3px solid #e3b45a; outline-offset: 2px; }

.inline-nav { display: flex; align-items: center; gap: .25rem; white-space: nowrap; }
.inline-nav a {
  display: inline-flex; align-items: center; gap: .35rem; min-height: 2.5rem; padding: .4rem .7rem;
  border-radius: .4rem; color: #3d555b; font-weight: 700; text-decoration: none;
}
.inline-nav a:hover { background: #f3f7f4; color: #172f35; }
.inline-nav a[aria-current="page"] { background: #e0eee9; color: #0d6055; }

button { margin: 0; font: inherit; }
.sign-out {
  min-height: 2.5rem; margin-left: .6rem; padding: .4rem .9rem; border: 1px solid #cbd9d4; border-radius: .4rem;
  background: #fff; color: #0d6055; font-weight: 700;
}
.sign-out:hover { background: #f3f7f4; }

.badge {
  display: inline-grid; place-items: center; min-width: 1.3rem; height: 1.3rem; padding: 0 .35rem;
  border-radius: 999px; background: #0d6055; color: #fff; font-size: .72rem; font-weight: 700; line-height: 1;
}

.measure { position: absolute; top: 0; left: 0; display: flex; gap: .25rem; visibility: hidden; pointer-events: none; white-space: nowrap; font-weight: 700; }
.measure-link { display: inline-flex; align-items: center; gap: .35rem; padding: .4rem .7rem; }
.measure .sign-out { margin-left: .6rem; padding: .4rem .9rem; border: 1px solid transparent; }

.menu-toggle {
  position: relative; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; min-height: 0; padding: 0;
  border: 0; border-radius: .4rem; background: transparent; color: #172f35;
}
.menu-toggle:hover { background: #f3f7f4; }
.menu-toggle svg { width: 1.6rem; height: 1.6rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.toggle-dot { position: absolute; top: .45rem; right: .4rem; width: .6rem; height: .6rem; border: 2px solid #fff; border-radius: 50%; background: #0d6055; }

/* Phone menu: fills the rest of the screen below the header. */
.menu-panel {
  position: absolute; top: 100%; left: 0; right: 0; display: flex; flex-direction: column;
  height: calc(100dvh - 4rem); overflow-y: auto; background: #fff; border-top: 1px solid #d6dfdb;
}
.menu-panel ul { margin: 0; padding: .5rem 0; list-style: none; }
.menu-panel li a {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3.5rem;
  padding: .75rem 1.5rem; border-left: .3rem solid transparent; color: #172f35; font-size: 1.1rem; font-weight: 700; text-decoration: none;
}
.menu-panel li a:hover { background: #f3f7f4; }
.menu-panel li a[aria-current="page"] { border-left-color: #0d6055; background: #eef7f2; color: #0d6055; }
.menu-account { margin-top: auto; padding: 1.25rem 1.5rem 2rem; border-top: 1px solid #d6dfdb; }
.menu-account p { margin: 0 0 .75rem; color: #526970; overflow-wrap: anywhere; }
.menu-account .sign-out { width: 100%; min-height: 3rem; margin: 0; }

.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 42rem) { .bar { padding: 0 1rem; } .menu-panel li a { padding-inline: 1rem; } .menu-account { padding-inline: 1rem; } }
</style>
