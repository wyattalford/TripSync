<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "./api.ts";

type Mode = "sign-in" | "register";
type GroupSummary = { group: string; name: string; owner: string; membership: string; memberCount: number };
const mode = ref<Mode>("sign-in");
const username = ref("");
const password = ref("");
const currentUsername = ref("");
const currentUser = ref("");
const groups = ref<GroupSummary[]>([]);
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
    if (currentUser.value) await refreshGroups();
  } catch {
    currentUsername.value = "";
    currentUser.value = "";
    groups.value = [];
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
      <section v-else-if="currentUsername" class="signed-in">
        <h2>Welcome, {{ currentUsername }}</h2>
        <button type="button" :disabled="busy" @click="signOut">Sign out</button>
        <div class="group-layout">
          <section class="status-panel">
            <h3>Your groups</h3>
            <p v-if="groups.length === 0">No groups yet. Create one or use an invitation link.</p>
            <ul v-else class="group-list">
              <li v-for="group in groups" :key="group.group" class="group-card">
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
