<script setup lang="ts">
import { ref } from "vue";
import { loginWithPasskey, registerPasskey } from "@passkeeper/client";

const username = ref("jane@example.com");
const displayName = ref("Jane");
const inviteCode = ref("launch-code");
const output = ref("Ready.");
const busy = ref(false);

function show(value: unknown): void {
  output.value = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function run(action: () => Promise<unknown>): Promise<void> {
  busy.value = true;
  try {
    show(await action());
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}

function register(): Promise<void> {
  return run(() =>
    registerPasskey({
      beginUrl: "/auth/passkey/register/begin",
      completeUrl: "/auth/passkey/register/complete",
      username: username.value,
      displayName: displayName.value,
      ...(inviteCode.value.trim() === "" ? {} : { inviteCode: inviteCode.value.trim() }),
    }),
  );
}

function login(): Promise<void> {
  return run(() =>
    loginWithPasskey({
      beginUrl: "/auth/passkey/login/begin",
      completeUrl: "/auth/passkey/login/complete",
      username: username.value,
    }),
  );
}

function me(): Promise<void> {
  return run(async () => {
    const response = await fetch("/auth/me", { credentials: "include" });
    return response.json();
  });
}

function logout(): Promise<void> {
  return run(async () => {
    const response = await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    return response.json();
  });
}
</script>

<template>
  <main>
    <section class="intro">
      <p class="eyebrow">Passkeeper + Vue</p>
      <h1>Passkey auth against the Cloudflare Worker routes.</h1>
      <p>
        Run the Worker example on port 8787, then start this app. Vite proxies
        <code>/auth</code> to the Worker while the browser handles the passkey ceremony.
      </p>
    </section>

    <form class="panel" @submit.prevent="register">
      <h2>Register</h2>
      <label>
        Email
        <input v-model="username" autocomplete="username webauthn" required type="email" />
      </label>
      <label>
        Display name
        <input v-model="displayName" autocomplete="name" required />
      </label>
      <label>
        Invite code
        <input v-model="inviteCode" autocomplete="one-time-code" required />
      </label>
      <button :disabled="busy" type="submit">Register passkey</button>
    </form>

    <form class="panel" @submit.prevent="login">
      <h2>Login</h2>
      <label>
        Email
        <input v-model="username" autocomplete="username webauthn" required type="email" />
      </label>
      <div class="actions">
        <button :disabled="busy" type="submit">Login</button>
        <button :disabled="busy" type="button" @click="me">Session</button>
        <button :disabled="busy" type="button" @click="logout">Logout</button>
      </div>
    </form>

    <section class="panel output">
      <h2>Output</h2>
      <pre>{{ output }}</pre>
    </section>
  </main>
</template>
