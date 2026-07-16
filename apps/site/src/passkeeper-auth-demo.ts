import {
  PasskeeperClientError,
  addPasskey,
  loginWithPasskey,
  registerPasskey,
} from "@passkeeper/client";

type DemoMode = "register" | "login";

export class PasskeeperAuthDemo extends HTMLElement {
  private initialized = false;

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.render();
    this.bindEvents();
  }

  private get authBase(): string {
    return this.getAttribute("auth-base")?.replace(/\/+$/u, "") || "/demo/auth";
  }

  private render(): void {
    const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const inviteCode = local ? "launch-code" : "passkeeper-demo";
    const demoUsername = `demo-${crypto.randomUUID().slice(0, 8)}@example.com`;

    this.innerHTML = `
      <div class="demo-shell">
        <div class="demo-tabs" role="tablist" aria-label="Demo auth mode">
          <button type="button" role="tab" aria-selected="true" aria-controls="demo-register-panel" data-demo-mode="register">register</button>
          <button type="button" role="tab" aria-selected="false" aria-controls="demo-login-panel" data-demo-mode="login" tabindex="-1">login</button>
        </div>

        <div class="demo-panel" id="demo-register-panel" role="tabpanel">
          <form id="register-form">
            <label>
              <span>email</span>
              <input name="username" type="email" value="${demoUsername}" autocomplete="username webauthn" required />
            </label>
            <label>
              <span>display name</span>
              <input name="displayName" value="Demo Visitor" autocomplete="name" required />
            </label>
            <label>
              <span>invite code / shared</span>
              <input name="inviteCode" value="${inviteCode}" autocomplete="one-time-code" readonly required />
            </label>
            <button class="demo-primary" type="submit" data-demo-action>register passkey</button>
          </form>
        </div>

        <div class="demo-panel" id="demo-login-panel" role="tabpanel" hidden>
          <form id="login-form">
            <label>
              <span>email</span>
              <input name="username" type="email" value="${demoUsername}" autocomplete="username webauthn" required />
            </label>
            <button class="demo-primary" type="submit" data-demo-action>login with passkey</button>
          </form>
        </div>

        <div class="demo-session-actions" aria-label="Session actions">
          <button id="me-button" type="button" data-demo-action>check session</button>
          <button id="add-passkey-button" type="button" data-demo-action>add passkey</button>
          <button id="logout-button" type="button" data-demo-action>logout</button>
        </div>

        <div class="demo-output-heading">
          <span>response</span>
          <span data-demo-state>ready</span>
        </div>
        <pre id="output" class="demo-output" aria-live="polite">Ready.</pre>
      </div>
    `;
  }

  private bindEvents(): void {
    const modeTabs = Array.from(
      this.querySelectorAll<HTMLButtonElement>("[data-demo-mode]"),
    );

    for (const [index, tab] of modeTabs.entries()) {
      tab.addEventListener("click", () => this.selectMode(tab, modeTabs));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const next = modeTabs[(index + offset + modeTabs.length) % modeTabs.length];
        if (next !== undefined) {
          this.selectMode(next, modeTabs);
          next.focus();
        }
      });
    }

    this.querySelector<HTMLFormElement>("#register-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(async () => {
        const form = event.currentTarget as HTMLFormElement;
        return registerPasskey({
          beginUrl: `${this.authBase}/passkey/register/begin`,
          completeUrl: `${this.authBase}/passkey/register/complete`,
          username: formValue(form, "username"),
          displayName: formValue(form, "displayName"),
          inviteCode: formValue(form, "inviteCode"),
        });
      });
    });

    this.querySelector<HTMLFormElement>("#login-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(async () => {
        const form = event.currentTarget as HTMLFormElement;
        return loginWithPasskey({
          beginUrl: `${this.authBase}/passkey/login/begin`,
          completeUrl: `${this.authBase}/passkey/login/complete`,
          username: formValue(form, "username"),
        });
      });
    });

    this.querySelector<HTMLButtonElement>("#add-passkey-button")?.addEventListener("click", () => {
      void this.run(() =>
        addPasskey({
          beginUrl: `${this.authBase}/passkey/register/add/begin`,
          completeUrl: `${this.authBase}/passkey/register/add/complete`,
        }),
      );
    });

    this.querySelector<HTMLButtonElement>("#me-button")?.addEventListener("click", () => {
      void this.run(() => this.request("/me", "GET"));
    });

    this.querySelector<HTMLButtonElement>("#logout-button")?.addEventListener("click", () => {
      void this.run(() => this.request("/logout", "POST"));
    });
  }

  private selectMode(tab: HTMLButtonElement, tabs: HTMLButtonElement[]): void {
    const mode = tab.dataset.demoMode;
    if (mode !== "register" && mode !== "login") return;

    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    }

    this.togglePanel("register", mode);
    this.togglePanel("login", mode);
  }

  private togglePanel(panelMode: DemoMode, selectedMode: DemoMode): void {
    const panel = this.querySelector<HTMLElement>(`#demo-${panelMode}-panel`);
    if (panel !== null) panel.hidden = panelMode !== selectedMode;
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.setBusy(true);

    try {
      this.show(await operation());
      this.setState("success");
    } catch (error) {
      this.show(formatError(error));
      this.setState("error");
    } finally {
      this.setBusy(false);
    }
  }

  private async request(path: string, method: "GET" | "POST"): Promise<unknown> {
    const response = await fetch(`${this.authBase}${path}`, {
      method,
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: "{}" }
        : {}),
    });
    const body = (await response.json()) as unknown;

    if (!response.ok) {
      throw new PasskeeperClientError({
        status: response.status,
        message: messageFromBody(body) ?? `Request failed with status ${response.status}.`,
        body,
      });
    }

    return body;
  }

  private setBusy(busy: boolean): void {
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-demo-action]")) {
      button.disabled = busy;
    }
    if (busy) this.setState("working");
  }

  private setState(state: string): void {
    const status = this.querySelector<HTMLElement>("[data-demo-state]");
    if (status !== null) status.textContent = state;
    this.dataset.state = state;
  }

  private show(value: unknown): void {
    const output = this.querySelector<HTMLElement>("#output");
    if (output !== null) {
      output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    }
  }
}

function formValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formatError(error: unknown): string {
  if (error instanceof PasskeeperClientError) {
    return error.message;
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "The passkey prompt was cancelled or timed out.";
  }
  return error instanceof Error ? error.message : String(error);
}

function messageFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const message = Reflect.get(body, "message");
  return typeof message === "string" && message.trim() !== "" ? message : undefined;
}

if (!customElements.get("passkeeper-auth-demo")) {
  customElements.define("passkeeper-auth-demo", PasskeeperAuthDemo);
}
