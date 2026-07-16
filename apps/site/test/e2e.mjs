import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const appDirectory = resolve(import.meta.dirname, "..");
const rootDirectory = resolve(appDirectory, "../..");
const persistenceDirectory = resolve(appDirectory, ".wrangler/e2e");
const wrangler = resolve(appDirectory, "node_modules/.bin/wrangler");
const vite = resolve(appDirectory, "node_modules/.bin/vite");
const origin = "http://localhost:4174";
let browser;
let worker;
let workerOutput = () => "";
const responseErrors = [];

try {
  await assertPortAvailable(4174);
  rmSync(persistenceDirectory, { recursive: true, force: true });
  runWrangler([
    "d1", "migrations", "apply", "passkeeper-site-demo", "--local",
    "--persist-to", persistenceDirectory,
    "--config", "wrangler.local.jsonc",
  ]);
  runWrangler([
    "d1", "execute", "passkeeper-site-demo", "--local",
    "--persist-to", persistenceDirectory,
    "--config", "wrangler.local.jsonc",
    "--file", resolve(rootDirectory, "scripts/seed-development-invite.sql"),
  ]);

  worker = spawn(
    vite,
    ["--host", "127.0.0.1", "--port", "4174", "--strictPort", "--mode", "e2e"],
    {
      cwd: appDirectory,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  workerOutput = collectOutput(worker);
  await waitForWorker(origin, worker, workerOutput);

  browser = await chromium.launch({
    executablePath: chromeExecutable(),
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("response", (response) => {
    if (response.status() < 400) return;
    void response.text().then((body) => {
      responseErrors.push(`${response.status()} ${response.url()} ${body}`);
    });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const credentialEvents = [];
  cdp.on("WebAuthn.credentialAdded", (event) => credentialEvents.push(event));
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: virtualAuthenticatorOptions(),
  });

  await page.goto(`${origin}/#demo`);
  await page.locator("passkeeper-auth-demo").waitFor();
  assert.match(await page.locator("#agent-prompt").innerText(), /First inspect the runtime/u);
  assert.equal(await page.locator('#register-form input[name="inviteCode"]').inputValue(), "launch-code");
  const username = `browser-${Date.now()}@example.com`;
  await page.locator('#register-form input[name="username"]').fill(username);
  await page.locator('#register-form input[name="displayName"]').fill("Browser Test");
  await page.locator("#register-form").evaluate((form) => form.requestSubmit());
  const registration = await waitForOutput(page, (value) => value?.user?.username === username);
  assert.equal(registration.user.username, username);
  assert.equal(typeof registration.session.id, "string");
  assert.equal(registration.credential.backedUp, undefined);

  await page.locator("#me-button").click();
  const initialSession = await waitForOutput(
    page,
    (value) => value?.user?.username === username && value?.credential === undefined,
  );
  assert.equal(initialSession.user.id, registration.user.id);

  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  const { authenticatorId: additionalAuthenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    { options: virtualAuthenticatorOptions() },
  );

  await page.locator("#add-passkey-button").click();
  const additional = await waitForOutput(
    page,
    (value) => typeof value?.credential?.id === "string" && value.credential.id !== registration.credential.id,
  );
  assert.equal(additional.user.id, registration.user.id);
  assert.equal(
    credentialEvents.some((event) => event.authenticatorId === additionalAuthenticatorId),
    true,
  );

  await page.locator("#logout-button").click();
  await waitForOutput(page, (value) => value?.ok === true);
  await page.locator("#me-button").click();
  await waitForTextOutput(page, "Request failed with status 401.");

  await page.locator('[data-demo-mode="login"]').click();
  await page.locator('#login-form input[name="username"]').fill(username);
  await page.locator("#login-form").evaluate((form) => form.requestSubmit());
  const login = await waitForOutput(
    page,
    (value) => value?.user?.username === username && value?.session?.id !== registration.session.id,
  );
  assert.equal(login.user.id, registration.user.id);

  await page.locator("#me-button").click();
  const restoredSession = await waitForOutput(
    page,
    (value) => value?.user?.username === username && value?.credential === undefined,
  );
  assert.equal(restoredSession.user.id, registration.user.id);

  const cookie = (await context.cookies()).find((candidate) => candidate.name === "pk_demo_session");
  assert.equal(cookie?.path, "/demo");
  process.stdout.write(
    "Verified embedded site demo registration, session, additional passkey, logout, and login in Chrome.\n",
  );
} finally {
  await browser?.close();
  worker?.kill("SIGTERM");
  await waitForExit(worker);
  rmSync(persistenceDirectory, { recursive: true, force: true });
}

function virtualAuthenticatorOptions() {
  return {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  };
}

function runWrangler(args) {
  const result = spawnSync(wrangler, args, {
    cwd: appDirectory,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`.trim());
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (executable === undefined) {
    throw new Error("Chrome was not found. Set CHROME_PATH to a Chrome or Chromium executable.");
  }
  return executable;
}

async function assertPortAvailable(port) {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  await new Promise((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
}

function collectOutput(process) {
  let output = "";
  process.stdout.on("data", (chunk) => { output += chunk; });
  process.stderr.on("data", (chunk) => { output += chunk; });
  return () => output;
}

async function waitForWorker(url, process, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Vite exited before startup.\n${output()}`);
    try {
      const response = await fetch(`${url}/demo/auth/me`);
      if (response.status === 401) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Vite did not start within 20 seconds.\n${output()}`);
}

async function waitForOutput(page, predicate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = await page.locator("#output").textContent();
    try {
      const value = JSON.parse(text);
      if (predicate(value)) return value;
    } catch {}
    await delay(50);
  }
  throw new Error(
    `Timed out waiting for demo output. Last output: ${await page.locator("#output").textContent()}\n` +
    `HTTP errors:\n${responseErrors.join("\n")}\n` +
    `Vite output:\n${workerOutput()}`,
  );
}

async function waitForTextOutput(page, expected) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = await page.locator("#output").textContent();
    if (text === expected) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(expected)}.`);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForExit(process) {
  if (process === undefined || process.exitCode !== null) return;
  await Promise.race([
    new Promise((resolvePromise) => process.once("exit", resolvePromise)),
    delay(2_000),
  ]);
}
