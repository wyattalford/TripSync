<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { api } from "./api.ts";
import {
  MIN_PASSWORD_LENGTH, authFailure, validateAuthForm,
  type AuthField, type AuthMode, type FieldErrors,
} from "./authForm.ts";

// Sign-in and registration screen. Emits `signed-in` once the session cookie is set;
// the parent then loads the account. `notice` explains why the person is here
// (for example, a session that ended while they were using the app).
const props = defineProps<{ notice?: string }>();
const emit = defineEmits<{ "signed-in": [mode: AuthMode] }>();

const mode = ref<AuthMode>("sign-in");
const username = ref("");
const password = ref("");
const confirm = ref("");
const showPassword = ref(false);
const showConfirm = ref(false);
const openTip = ref<"" | "username" | "password">("");
const busy = ref(false);
const fieldErrors = ref<FieldErrors>({});
const formError = ref("");

const registering = computed(() => mode.value === "register");
const inputs: Record<AuthField, string> = { username: "auth-username", password: "auth-password", confirm: "auth-confirm" };

watch(mode, () => {
  fieldErrors.value = {};
  formError.value = "";
  confirm.value = "";
  openTip.value = "";
  showPassword.value = false;
  showConfirm.value = false;
});

function setMode(next: AuthMode) {
  mode.value = next;
  void nextTick(() => document.getElementById(inputs.username)?.focus());
}

function toggleTip(tip: "username" | "password") {
  openTip.value = openTip.value === tip ? "" : tip;
}

function describedBy(...ids: (string | false)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

async function focusFirstError() {
  await nextTick();
  const first = (["username", "password", "confirm"] as const).find((field) => fieldErrors.value[field]);
  document.getElementById(first ? inputs[first] : "auth-form-error")?.focus();
}

async function fail(step: AuthMode, error: string) {
  const failure = import.meta.env.DEV && location.hostname === "localhost" && error === "FORBIDDEN"
    ? { message: "Open the local app at http://127.0.0.1:5173 and try again." }
    : authFailure(step, error);
  if (failure.field) fieldErrors.value = { [failure.field]: failure.message };
  else formError.value = failure.message;
  if (step === "sign-in") password.value = "";
  await focusFirstError();
}

async function submit() {
  formError.value = "";
  fieldErrors.value = validateAuthForm(mode.value, { username: username.value, password: password.value, confirm: confirm.value });
  if (Object.keys(fieldErrors.value).length) return focusFirstError();
  const credentials = { username: username.value.trim(), password: password.value };
  busy.value = true;
  try {
    if (registering.value) {
      const registered = await api.auth.register(credentials);
      if ("error" in registered) return await fail("register", registered.error);
    }
    const signedIn = await api.auth["sign-in"](credentials);
    if ("error" in signedIn) return await fail("sign-in", signedIn.error);
    password.value = "";
    confirm.value = "";
    emit("signed-in", mode.value);
  } catch {
    await fail(mode.value, "NETWORK_ERROR");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="status-panel auth-panel" aria-labelledby="auth-heading">
    <h2 id="auth-heading">{{ registering ? "Create an account" : "Welcome back" }}</h2>

    <p v-if="props.notice" class="auth-alert" role="status">{{ props.notice }}</p>
    <p v-if="formError" id="auth-form-error" class="auth-error-summary" role="alert" tabindex="-1">
      <span aria-hidden="true">✕</span> {{ formError }}
    </p>

    <form novalidate @submit.prevent="submit">
      <div class="field">
        <div class="label-row">
          <label :for="inputs.username">Username</label>
          <template v-if="registering">
            <button
              type="button" class="info" aria-label="About usernames" aria-describedby="auth-username-tip"
              :aria-expanded="openTip === 'username'" @click="toggleTip('username')" @blur="openTip = ''" @keydown.esc="openTip = ''"
            >i</button>
            <span id="auth-username-tip" role="tooltip" class="tooltip">Friends invite you by this name. Capital letters do not matter.</span>
          </template>
        </div>
        <p v-if="fieldErrors.username" id="auth-username-error" class="field-error"><span aria-hidden="true">✕</span> {{ fieldErrors.username }}</p>
        <input
          :id="inputs.username" v-model="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false"
          :disabled="busy" :aria-invalid="!!fieldErrors.username"
          :aria-describedby="describedBy(registering && 'auth-username-tip', !!fieldErrors.username && 'auth-username-error')"
        />
      </div>

      <div class="field">
        <div class="label-row">
          <label :for="inputs.password">Password</label>
          <template v-if="registering">
            <button
              type="button" class="info" aria-label="Password requirements" aria-describedby="auth-password-tip"
              :aria-expanded="openTip === 'password'" @click="toggleTip('password')" @blur="openTip = ''" @keydown.esc="openTip = ''"
            >i</button>
            <span id="auth-password-tip" role="tooltip" class="tooltip">Use at least {{ MIN_PASSWORD_LENGTH }} characters.</span>
          </template>
        </div>
        <p v-if="fieldErrors.password" id="auth-password-error" class="field-error"><span aria-hidden="true">✕</span> {{ fieldErrors.password }}</p>
        <div class="password-field">
          <input
            :id="inputs.password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'"
            :autocomplete="registering ? 'new-password' : 'current-password'"
            :disabled="busy" :aria-invalid="!!fieldErrors.password"
            :aria-describedby="describedBy(registering && 'auth-password-tip', !!fieldErrors.password && 'auth-password-error')"
          />
          <button
            type="button" class="reveal" :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword" :disabled="busy" @click="showPassword = !showPassword"
          >
            <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              <path d="m3 3 18 18" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="registering" class="field">
        <label :for="inputs.confirm">Confirm password</label>
        <p v-if="fieldErrors.confirm" id="auth-confirm-error" class="field-error"><span aria-hidden="true">✕</span> {{ fieldErrors.confirm }}</p>
        <div class="password-field">
          <input
            :id="inputs.confirm" v-model="confirm" name="confirm-password" :type="showConfirm ? 'text' : 'password'" autocomplete="new-password"
            :disabled="busy" :aria-invalid="!!fieldErrors.confirm" :aria-describedby="fieldErrors.confirm ? 'auth-confirm-error' : undefined"
          />
          <button
            type="button" class="reveal" :aria-label="showConfirm ? 'Hide confirmed password' : 'Show confirmed password'"
            :aria-pressed="showConfirm" :disabled="busy" @click="showConfirm = !showConfirm"
          >
            <svg v-if="!showConfirm" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              <path d="m3 3 18 18" />
            </svg>
          </button>
        </div>
      </div>

      <button type="submit" class="submit" :disabled="busy">{{ busy ? "Please wait…" : registering ? "Create account" : "Sign in" }}</button>
    </form>

    <p class="auth-switch">
      {{ registering ? "Already have an account?" : "New to OpenTime?" }}
      <button type="button" class="link-button" :disabled="busy" @click="setMode(registering ? 'sign-in' : 'register')">
        {{ registering ? "Sign in" : "Create an account" }}
      </button>
    </p>
  </section>
</template>

<style scoped>
/* Colors follow design/visual-design-study.md: teal actions, pale teal fills, pale amber for
   changes, rose for problems, muted slate for supporting text. Errors also carry ✕ and words
   so they read in grayscale. Sizes are fluid so the card works from small phones to desktops. */
.auth-panel {
  width: 100%;
  max-width: 26rem;
  margin: clamp(0rem, 6vh, 3rem) auto 0;
  padding: clamp(1.25rem, 5vw, 2rem);
}
.auth-panel h2 { margin: 0 0 1.25rem; color: #172f35; font-size: clamp(1.45rem, 5vw, 1.75rem); letter-spacing: -.02em; }
.auth-panel form { gap: 1rem; }

.field { display: grid; gap: .4rem; min-width: 0; }
.label-row { position: relative; display: flex; align-items: center; gap: .4rem; }
.label-row label, .field > label { margin: 0; }

/* Info button: small visible circle, but a 2.25rem hit area for touch. */
.info {
  position: relative; display: inline-grid; place-items: center;
  width: 1.15rem; height: 1.15rem; min-height: 0; margin: 0; padding: 0;
  border: 1.5px solid #526970; border-radius: 50%; background: transparent; color: #526970;
  font: italic 700 .72rem/1 Georgia, "Times New Roman", serif;
}
.info::before { content: ""; position: absolute; inset: -.55rem; }
.info:hover, .info[aria-expanded="true"] { border-color: #0d6055; background: #0d6055; color: #fff; }
/* Floating tooltip: shown on hover, keyboard focus, or tap; never moves the fields below it.
   Anchored to the label row so it stays inside the card on narrow phones. */
.tooltip {
  position: absolute; bottom: calc(100% + .45rem); left: 0; z-index: 10;
  width: max-content; max-width: min(17rem, 100%); padding: .5rem .7rem;
  border-radius: .35rem; background: #172f35; color: #fff; font-size: .85rem; font-weight: 400; line-height: 1.35;
  box-shadow: 0 4px 14px rgb(23 47 53 / .18);
  opacity: 0; visibility: hidden; transform: translateY(.2rem); pointer-events: none;
  transition: opacity .12s ease, transform .12s ease, visibility .12s;
}
.info:hover + .tooltip, .info:focus-visible + .tooltip, .info[aria-expanded="true"] + .tooltip {
  opacity: 1; visibility: visible; transform: none;
}

.auth-alert { margin: 0 0 1rem; padding: .75rem .9rem; border: 1px solid #e3b45a; border-radius: .4rem; background: #fdf1cf; color: #5b4510; }
.auth-error-summary { margin: 0 0 1rem; padding: .75rem .9rem; border-left: .3rem solid #b2463a; border-radius: .35rem; background: #f9e6e2; color: #82382f; font-weight: 700; }
.auth-error-summary:focus { outline: 3px solid #e3b45a; outline-offset: 2px; }
.field-error { margin: 0; color: #82382f; font-size: .9rem; font-weight: 700; }

/* 1rem inputs keep iOS Safari from zooming on focus. */
.auth-panel input { min-height: 2.9rem; font-size: 1rem; }
.status-panel input[aria-invalid="true"] { border: 2px solid #b2463a; }

.password-field { position: relative; min-width: 0; }
.password-field input { padding-right: 3.2rem; }
.reveal {
  position: absolute; top: 50%; right: .3rem; transform: translateY(-50%);
  display: grid; place-items: center; width: 2.5rem; height: 2.5rem; min-height: 0; margin: 0; padding: 0;
  border-radius: .3rem; background: transparent; color: #526970;
}
.reveal:hover { background: #e0eee9; color: #0d6055; }
.reveal svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.auth-panel form .submit { justify-self: stretch; width: 100%; min-height: 2.9rem; margin-top: .5rem; font-weight: 700; }

.auth-switch { margin: 1.25rem 0 0; color: #3d555b; text-align: center; }
.link-button { min-height: 0; margin: 0; padding: .25rem; background: none; color: #0d6055; font-weight: 700; text-decoration: underline; text-underline-offset: .15em; }
.link-button:hover { background: none; color: #084c43; }

@media (max-width: 30rem) {
  /* On small phones the card becomes the page: no floating border, full width. */
  .auth-panel { margin-top: 0; border: 0; border-radius: 0; background: transparent; padding-inline: 0; }
}
</style>
