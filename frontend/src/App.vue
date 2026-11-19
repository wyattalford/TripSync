<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "./api.ts";

type Mode = "sign-in" | "register";
const mode = ref<Mode>("sign-in");
const username = ref("");
const password = ref("");
const currentUsername = ref("");
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

async function refreshAccount() {
  try {
    const result = await api.auth.current();
    currentUsername.value = "error" in result ? "" : result.username;
  } catch {
    currentUsername.value = "";
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    loading.value = false;
  }
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
    showMessage("Signed out.", "success");
  } catch {
    showMessage("OpenTime could not reach the server. Try again.", "error");
  } finally {
    busy.value = false;
  }
}

onMounted(refreshAccount);
</script>

<template>
  <div class="app-shell">
    <header class="site-header"><span class="wordmark">OpenTime</span></header>
    <main class="content">
      <p class="eyebrow">Make time together</p>
      <h1>Find an opening. Make a plan.</h1>
      <p class="intro">Share when an invitation would be welcome, find time your group has in common, and decide together whether to meet.</p>

      <p v-if="message" class="notice" :class="messageKind" role="status">{{ message }}</p>
      <p v-if="loading">Checking your account…</p>
      <section v-else-if="currentUsername" class="status-panel">
        <h2>Welcome, {{ currentUsername }}</h2>
        <p>Your account is ready.</p>
        <button type="button" :disabled="busy" @click="signOut">Sign out</button>
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
