import { createPasskeeperRoutes } from "@passkeeper/cloudflare";
import { d1Adapter, type D1DatabaseLike } from "@passkeeper/d1";

export interface Env {
  DB: D1DatabaseLike;
  RP_ID?: string;
  RP_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return htmlResponse(indexHtml);
    }

    if (request.method === "GET" && url.pathname === "/client.js") {
      return javascriptResponse(clientJs);
    }

    const routes = createPasskeeperRoutes({
      rpName: "Passkeeper Example",
      ...relyingPartyConfig(url, env),
      storage: d1Adapter(env.DB),
      inviteRequired: true,
      sessionCookie: {
        secure: url.protocol === "https:",
      },
    });

    return routes.handle(request);
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await d1Adapter(env.DB).deleteExpiredRecords(new Date());
  },
};

function relyingPartyConfig(url: URL, env: Env): { rpId: string; origin: string } {
  return {
    rpId: env.RP_ID ?? url.hostname,
    origin: env.RP_ORIGIN ?? url.origin,
  };
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function javascriptResponse(script: string): Response {
  return new Response(script, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
    },
  });
}

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Passkeeper Cloudflare Example</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f7f4;
        color: #1f2428;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }

      main {
        width: min(720px, calc(100vw - 32px));
        display: grid;
        gap: 20px;
      }

      h1 {
        margin: 0;
        font-size: 32px;
      }

      form, section {
        background: #ffffff;
        border: 1px solid #d8ddd7;
        border-radius: 8px;
        padding: 20px;
        display: grid;
        gap: 14px;
      }

      label {
        display: grid;
        gap: 6px;
        font-size: 14px;
      }

      input, button {
        font: inherit;
        border-radius: 6px;
      }

      input {
        border: 1px solid #bfc8c1;
        padding: 10px 12px;
      }

      button {
        border: 0;
        background: #1f6f55;
        color: #ffffff;
        padding: 10px 14px;
        cursor: pointer;
      }

      button.secondary {
        background: #41515a;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #eef1ee;
        border-radius: 6px;
        padding: 12px;
        min-height: 72px;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Passkeeper Cloudflare Example</h1>
        <p>Passkey registration, login, session check, and logout against a Worker + D1 backend.</p>
      </header>

      <form id="register-form">
        <strong>Register</strong>
        <label>
          Email
          <input name="username" type="email" value="jane@example.com" autocomplete="username webauthn" required />
        </label>
        <label>
          Display name
          <input name="displayName" value="Jane" autocomplete="name" required />
        </label>
        <label>
          Invite code
          <input name="inviteCode" value="launch-code" autocomplete="one-time-code" required />
        </label>
        <button type="submit">Register passkey</button>
      </form>

      <form id="login-form">
        <strong>Login</strong>
        <label>
          Email
          <input name="username" type="email" value="jane@example.com" autocomplete="username webauthn" required />
        </label>
        <div class="actions">
          <button type="submit">Login with passkey</button>
          <button class="secondary" id="me-button" type="button">Check session</button>
          <button class="secondary" id="logout-button" type="button">Logout</button>
        </div>
      </form>

      <section>
        <strong>Output</strong>
        <pre id="output">Ready.</pre>
      </section>
    </main>
    <script type="module" src="/client.js"></script>
  </body>
</html>`;

const clientJs = `const output = document.querySelector("#output");
const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#login-form");
const meButton = document.querySelector("#me-button");
const logoutButton = document.querySelector("#logout-button");

function show(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function showError(error) {
  show(error instanceof Error ? error.message : String(error));
}

function formValue(form, name) {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value.trim() : "";
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const inviteCode = formValue(registerForm, "inviteCode");
    const begin = await postJson("/auth/passkey/register/begin", {
      username: formValue(registerForm, "username"),
      displayName: formValue(registerForm, "displayName"),
      ...(inviteCode === "" ? {} : { inviteCode }),
    });
    const credential = await navigator.credentials.create({
      publicKey: creationOptionsFromJSON(begin.publicKey),
    });
    const result = await postJson("/auth/passkey/register/complete", {
      challengeId: begin.challengeId,
      userId: begin.user.id,
      credential: registrationCredentialToJSON(credential),
      ...(inviteCode === "" ? {} : { inviteCode }),
    });
    show(result);
  } catch (error) {
    showError(error);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const begin = await postJson("/auth/passkey/login/begin", {
      username: formValue(loginForm, "username"),
    });
    const credential = await navigator.credentials.get({
      publicKey: requestOptionsFromJSON(begin.publicKey),
    });
    const result = await postJson("/auth/passkey/login/complete", {
      challengeId: begin.challengeId,
      credential: authenticationCredentialToJSON(credential),
    });
    show(result);
  } catch (error) {
    showError(error);
  }
});

meButton.addEventListener("click", async () => {
  try {
    show(await getJson("/auth/me"));
  } catch (error) {
    showError(error);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    show(await postJson("/auth/logout", {}));
  } catch (error) {
    showError(error);
  }
});

async function getJson(url) {
  const response = await fetch(url, { credentials: "include" });
  return readJsonResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const value = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(messageForFailedResponse(response.status, value));
  }
  return value;
}

async function readResponseBody(response) {
  const contentType = response.headers.get("content-type");
  if (contentType?.toLowerCase().includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text === "" ? null : text;
}

function messageForFailedResponse(status, value) {
  if (typeof value?.message === "string" && value.message.trim() !== "") {
    return value.message;
  }
  if (typeof value?.error === "string" && value.error.trim() !== "") {
    return value.error;
  }
  return \`Request failed with status \${status}.\`;
}

function creationOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64UrlDecode(options.challenge),
    user: {
      ...options.user,
      id: base64UrlDecode(options.user.id),
    },
    excludeCredentials: options.excludeCredentials.map((credential) => ({
      ...credential,
      id: base64UrlDecode(credential.id),
    })),
  };
}

function requestOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64UrlDecode(options.challenge),
    allowCredentials: options.allowCredentials.map((credential) => ({
      ...credential,
      id: base64UrlDecode(credential.id),
    })),
  };
}

function registrationCredentialToJSON(credential) {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: base64UrlEncode(new Uint8Array(credential.rawId)),
    response: {
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
      attestationObject: base64UrlEncode(new Uint8Array(response.attestationObject)),
      ...(typeof response.getAuthenticatorData === "function"
        ? { authenticatorData: base64UrlEncode(new Uint8Array(response.getAuthenticatorData())) }
        : {}),
      ...(typeof response.getTransports === "function" ? { transports: response.getTransports() } : {}),
      ...(typeof response.getPublicKeyAlgorithm === "function"
        ? { publicKeyAlgorithm: response.getPublicKeyAlgorithm() }
        : {}),
      ...(typeof response.getPublicKey === "function" && response.getPublicKey() !== null
        ? { publicKey: base64UrlEncode(new Uint8Array(response.getPublicKey())) }
        : {}),
    },
    ...(credential.authenticatorAttachment === null
      ? {}
      : { authenticatorAttachment: credential.authenticatorAttachment }),
    clientExtensionResults: credential.getClientExtensionResults(),
    type: "public-key",
  };
}

function authenticationCredentialToJSON(credential) {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: base64UrlEncode(new Uint8Array(credential.rawId)),
    response: {
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
      authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
      signature: base64UrlEncode(new Uint8Array(response.signature)),
      ...(response.userHandle === null
        ? {}
        : { userHandle: base64UrlEncode(new Uint8Array(response.userHandle)) }),
    },
    ...(credential.authenticatorAttachment === null
      ? {}
      : { authenticatorAttachment: credential.authenticatorAttachment }),
    clientExtensionResults: credential.getClientExtensionResults(),
    type: "public-key",
  };
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}`;
