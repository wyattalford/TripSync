<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { api } from "./api.ts";
import {
  DEFAULT_LEAD_MINUTES, LEAD_PRESETS, browserTimeZone, formatLead, fromMinutes, isCode, isEmailAddress,
  leadError, settingsError, toMinutes, type LeadUnit,
} from "./settings.ts";

// Account settings: reminder time and a verified email address for reminders.
defineProps<{ username: string }>();

const loading = ref(true);
const loadError = ref("");

// Reminders
const savedLead = ref(DEFAULT_LEAD_MINUTES);
const selectedPreset = ref<number | "custom">(DEFAULT_LEAD_MINUTES);
const customAmount = ref(1);
const customUnit = ref<LeadUnit>("hours");
const reminderBusy = ref(false);
const reminderMessage = ref("");
const reminderError = ref("");

const chosenLead = computed(() => selectedPreset.value === "custom" ? toMinutes(Number(customAmount.value), customUnit.value) : selectedPreset.value);
const chosenLeadError = computed(() => leadError(chosenLead.value));
const leadChanged = computed(() => chosenLead.value !== savedLead.value);

// Email
const email = ref("");
const pendingEmail = ref("");
const emailReminders = ref(true);
const emailInput = ref("");
const codeInput = ref("");
const changingEmail = ref(false);
const emailBusy = ref(false);
const emailError = ref("");
const emailMessage = ref("");
const cooldownUntil = ref(0);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
const cooldownLeft = computed(() => Math.max(0, Math.ceil((cooldownUntil.value - now.value) / 1000)));
const emailState = computed<"none" | "pending" | "verified">(() => {
  if (pendingEmail.value) return "pending";
  if (email.value && !changingEmail.value) return "verified";
  return "none";
});

function applyLead(minutes: number) {
  savedLead.value = minutes;
  if (LEAD_PRESETS.some((preset) => preset.minutes === minutes)) {
    selectedPreset.value = minutes;
  } else {
    selectedPreset.value = "custom";
    const shown = fromMinutes(minutes);
    customAmount.value = shown.amount;
    customUnit.value = shown.unit;
  }
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await api.settings.get();
    if ("error" in result) { loadError.value = settingsError("email", result.error); return; }
    applyLead(Number(result.leadMinutes));
    const contact = result.contact as { email: string; pendingEmail: string; emailReminders: boolean };
    email.value = contact.email;
    pendingEmail.value = contact.pendingEmail;
    emailReminders.value = contact.emailReminders;
  } catch {
    loadError.value = settingsError("email", "NETWORK_ERROR");
  } finally {
    loading.value = false;
  }
}

async function saveReminders() {
  reminderMessage.value = "";
  reminderError.value = chosenLeadError.value;
  if (reminderError.value || chosenLead.value === null) return;
  reminderBusy.value = true;
  try {
    const result = await api.settings.reminders({ leadMinutes: chosenLead.value, timeZone: browserTimeZone() });
    if ("error" in result) { reminderError.value = settingsError("reminders", result.error); return; }
    applyLead(chosenLead.value);
    reminderMessage.value = `Saved. You'll be reminded ${formatLead(chosenLead.value)} before each confirmed gathering.`;
  } catch {
    reminderError.value = settingsError("reminders", "NETWORK_ERROR");
  } finally {
    reminderBusy.value = false;
  }
}

async function sendCode(address = emailInput.value) {
  emailError.value = "";
  emailMessage.value = "";
  if (!isEmailAddress(address)) { emailError.value = "Enter a valid email address."; return; }
  emailBusy.value = true;
  try {
    const result = await api.settings.email.request({ email: address.trim() });
    if ("error" in result) { emailError.value = settingsError("request", result.error); return; }
    pendingEmail.value = address.trim().toLowerCase();
    codeInput.value = "";
    cooldownUntil.value = Date.now() + 60_000;
    await nextTick();
    document.getElementById("settings-code")?.focus();
  } catch {
    emailError.value = settingsError("request", "NETWORK_ERROR");
  } finally {
    emailBusy.value = false;
  }
}

async function confirmCode() {
  emailError.value = "";
  emailMessage.value = "";
  if (!isCode(codeInput.value)) { emailError.value = "Enter the 6-digit code from the email."; return; }
  emailBusy.value = true;
  try {
    const result = await api.settings.email.verify({ code: codeInput.value.trim() });
    if ("error" in result) { emailError.value = settingsError("verify", result.error); return; }
    email.value = String(result.email);
    pendingEmail.value = "";
    changingEmail.value = false;
    emailInput.value = "";
    codeInput.value = "";
  } catch {
    emailError.value = settingsError("verify", "NETWORK_ERROR");
  } finally {
    emailBusy.value = false;
  }
}

async function toggleEmailReminders() {
  const enabled = !emailReminders.value;
  emailError.value = "";
  emailMessage.value = "";
  emailBusy.value = true;
  try {
    const result = await api.settings.email.reminders({ enabled });
    if ("error" in result) { emailError.value = settingsError("email", result.error); return; }
    emailReminders.value = enabled;
  } catch {
    emailError.value = settingsError("email", "NETWORK_ERROR");
  } finally {
    emailBusy.value = false;
  }
}

async function removeEmail() {
  emailError.value = "";
  emailMessage.value = "";
  emailBusy.value = true;
  try {
    const result = await api.settings.email.remove();
    if ("error" in result) { emailError.value = settingsError("email", result.error); return; }
    email.value = "";
    pendingEmail.value = "";
    changingEmail.value = false;
  } catch {
    emailError.value = settingsError("email", "NETWORK_ERROR");
  } finally {
    emailBusy.value = false;
  }
}

function startChange() {
  changingEmail.value = true;
  pendingEmail.value = "";
  emailInput.value = "";
  emailError.value = "";
  emailMessage.value = "";
}

function cancelPending() {
  pendingEmail.value = "";
  changingEmail.value = false;
  codeInput.value = "";
  emailError.value = "";
  emailMessage.value = "";
}

onMounted(() => {
  void load();
  ticker = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (ticker) clearInterval(ticker); });
</script>

<template>
  <section class="settings" aria-labelledby="settings-heading">
    <header class="settings-header">
      <h2 id="settings-heading">Settings</h2>
    </header>

    <p v-if="loading" class="muted">Loading your settings…</p>
    <p v-else-if="loadError" class="alert error" role="alert">{{ loadError }} <button type="button" class="link-button" @click="load">Try again</button></p>

    <template v-else>
      <section class="status-panel card" aria-labelledby="reminders-heading">
        <h3 id="reminders-heading">Reminders</h3>

        <fieldset class="presets">
          <legend>How long before a gathering should we remind you?</legend>
          <div class="chips">
            <label v-for="preset in LEAD_PRESETS" :key="preset.minutes" class="chip" :class="{ selected: selectedPreset === preset.minutes }">
              <input v-model="selectedPreset" type="radio" name="lead" :value="preset.minutes" :disabled="reminderBusy" />
              {{ preset.label }}
            </label>
            <label class="chip" :class="{ selected: selectedPreset === 'custom' }">
              <input v-model="selectedPreset" type="radio" name="lead" value="custom" :disabled="reminderBusy" />
              Custom
            </label>
          </div>
        </fieldset>

        <div v-if="selectedPreset === 'custom'" class="custom-lead">
          <label class="visually-hidden" for="lead-amount">Amount</label>
          <input id="lead-amount" v-model.number="customAmount" type="number" inputmode="numeric" min="1" :max="customUnit === 'hours' ? 24 : 1440" step="1" :disabled="reminderBusy" :aria-invalid="!!chosenLeadError" />
          <label class="visually-hidden" for="lead-unit">Unit</label>
          <select id="lead-unit" v-model="customUnit" :disabled="reminderBusy">
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
          </select>
          <span class="muted">before</span>
        </div>

        <p v-if="reminderError || (selectedPreset === 'custom' && chosenLeadError)" class="field-error" role="alert"><span aria-hidden="true">✕</span> {{ reminderError || chosenLeadError }}</p>
        <p v-if="reminderMessage" class="alert success" role="status"><span aria-hidden="true">✓</span> {{ reminderMessage }}</p>

        <button type="button" class="primary" :disabled="reminderBusy || !leadChanged || !!chosenLeadError" @click="saveReminders">
          {{ reminderBusy ? "Saving…" : "Save reminder time" }}
        </button>
      </section>

      <section class="status-panel card" aria-labelledby="email-heading">
        <h3 id="email-heading">Email</h3>

        <p v-if="emailError" class="alert error" role="alert"><span aria-hidden="true">✕</span> {{ emailError }}</p>
        <p v-if="emailMessage" class="alert success" role="status"><span aria-hidden="true">✓</span> {{ emailMessage }}</p>

        <!-- No address yet, or changing it -->
        <form v-if="emailState === 'none'" class="stack" novalidate @submit.prevent="sendCode()">
          <p class="muted">Add an email to get reminders there too.</p>
          <label for="settings-email">Email address</label>
          <input id="settings-email" v-model="emailInput" type="email" autocomplete="email" inputmode="email" :disabled="emailBusy" />
          <div class="row">
            <button type="submit" class="primary" :disabled="emailBusy">{{ emailBusy ? "Sending…" : "Send code" }}</button>
            <button v-if="changingEmail" type="button" class="link-button" :disabled="emailBusy" @click="changingEmail = false">Cancel</button>
          </div>
        </form>

        <!-- Code sent, waiting for confirmation -->
        <form v-else-if="emailState === 'pending'" class="stack" novalidate @submit.prevent="confirmCode">
          <p class="muted">Enter the code we sent to <strong>{{ pendingEmail }}</strong>. It expires in 15 minutes.</p>
          <label for="settings-code">6-digit code</label>
          <input id="settings-code" v-model="codeInput" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :disabled="emailBusy" />
          <div class="row">
            <button type="submit" class="primary" :disabled="emailBusy">{{ emailBusy ? "Checking…" : "Confirm email" }}</button>
            <button type="button" class="link-button" :disabled="emailBusy || cooldownLeft > 0" @click="sendCode(pendingEmail)">
              {{ cooldownLeft > 0 ? `Send a new code in ${cooldownLeft}s` : "Send a new code" }}
            </button>
            <button type="button" class="link-button" :disabled="emailBusy" @click="cancelPending">Use a different email</button>
          </div>
        </form>

        <!-- Verified -->
        <div v-else class="stack">
          <div class="verified">
            <span class="address">{{ email }}</span>
            <span class="tag"><span aria-hidden="true">✓</span> Verified</span>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="emailReminders" :disabled="emailBusy" @change="toggleEmailReminders" />
            <span>Email me reminders</span>
          </label>
          <div class="row">
            <button type="button" class="secondary" :disabled="emailBusy" @click="startChange">Change email</button>
            <button type="button" class="link-button danger" :disabled="emailBusy" @click="removeEmail">Remove email</button>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
/* Visual design study colors: teal primary actions, pale teal selected chips, mint success,
   rose errors. Every state also has words and a symbol. */
.settings { display: grid; gap: 1.25rem; max-width: 40rem; }
.settings-header h2 { margin: 0; font-size: clamp(1.5rem, 5vw, 1.9rem); }
.settings-header p { margin: .35rem 0 0; color: #526970; overflow-wrap: anywhere; }
.card { max-width: none; display: grid; gap: .75rem; padding: clamp(1rem, 4vw, 1.5rem); }
.card h3 { margin: 0; font-size: 1.2rem; }
.card p { margin: 0; }
.muted { color: #526970; line-height: 1.5; }
.small { font-size: .85rem; }

button { margin: 0; }
.primary { justify-self: start; min-height: 2.75rem; font-weight: 700; }
.link-button { min-height: 2.5rem; padding: .25rem .2rem; background: none; color: #0d6055; font-weight: 700; text-decoration: underline; text-underline-offset: .15em; }
.link-button:hover { background: none; color: #084c43; }
.link-button:disabled { color: #82a89c; cursor: default; text-decoration: none; }
.link-button.danger { color: #82382f; }

.presets { display: grid; gap: .5rem; margin: 0; padding: 0; border: 0; min-width: 0; }
.presets legend { margin-bottom: .5rem; padding: 0; font-weight: 400; }
.chips { display: flex; flex-wrap: wrap; gap: .5rem; }
.chip {
  position: relative; display: inline-flex; align-items: center; min-height: 2.5rem; padding: .45rem .9rem;
  border: 1px solid #cbd9d4; border-radius: 999px; background: #fff; color: #172f35; font-weight: 700; cursor: pointer;
}
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.chip:hover { background: #f3f7f4; }
.chip.selected { border-color: #0d6055; background: #e0eee9; color: #0d6055; }
.chip:has(input:focus-visible) { outline: 3px solid #e3b45a; outline-offset: 2px; }

.custom-lead { display: flex; flex-wrap: nowrap; align-items: center; gap: .5rem; }
.custom-lead input { flex: none; width: 5.5rem; }
.status-panel .custom-lead select { flex: none; width: auto; }
.custom-lead input, .custom-lead select { min-height: 2.75rem; padding: .55rem .7rem; border: 1px solid #849e98; border-radius: .35rem; background: #fff; font: inherit; font-size: 1rem; }

.alert { padding: .7rem .9rem; border-radius: .4rem; line-height: 1.45; }
.alert.success { background: #d9efe5; color: #0a544a; }
.alert.error { background: #f9e6e2; color: #82382f; }
.field-error { color: #82382f; font-weight: 700; }

.stack { display: grid; gap: .6rem; min-width: 0; }
.stack label { font-weight: 700; }
.stack label[for="settings-email"], .stack label[for="settings-code"] { font-weight: 400; }
.stack input[type="email"], .code-input { width: 100%; max-width: 24rem; min-height: 2.9rem; padding: .7rem .8rem; border: 1px solid #849e98; border-radius: .35rem; font: inherit; font-size: 1rem; }
.code-input { max-width: 10rem; letter-spacing: .3em; font-variant-numeric: tabular-nums; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; }

.verified { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; }
.address { font-weight: 700; overflow-wrap: anywhere; }
.tag { padding: .15rem .55rem; border-radius: 999px; background: #d9efe5; color: #0a544a; font-size: .8rem; font-weight: 700; }
.switch { display: inline-flex; align-items: center; gap: .6rem; min-height: 2.75rem; font-weight: 700; cursor: pointer; }
.switch input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: #0d6055; }

input:focus-visible, select:focus-visible { outline: 3px solid #e3b45a; outline-offset: 1px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
