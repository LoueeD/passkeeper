import "./style.css";
import "./passkeeper-auth-demo";

type Theme = "light" | "dark";
type PackageManager = "pnpm" | "npm" | "bun";

const installCommands: Record<PackageManager, string> = {
  pnpm: "pnpm add @passkeeper/core @passkeeper/client @passkeeper/cloudflare @passkeeper/d1",
  npm: "npm install @passkeeper/core @passkeeper/client @passkeeper/cloudflare @passkeeper/d1",
  bun: "bun add @passkeeper/core @passkeeper/client @passkeeper/cloudflare @passkeeper/d1",
};

const root = document.documentElement;
const themeButton = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
const themeLabel = document.querySelector<HTMLElement>("[data-theme-label]");
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const packageTabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-package-manager]"),
);
const commandValue = document.querySelector<HTMLElement>("[data-command-value]");
const copyButton = document.querySelector<HTMLButtonElement>("#copy-install");
const copyStatus = document.querySelector<HTMLElement>("[data-copy-status]");
let copyResetTimer: number | undefined;

setTheme(initialTheme());

themeButton?.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
});

for (const [index, tab] of packageTabs.entries()) {
  tab.addEventListener("click", () => selectPackageManager(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + offset + packageTabs.length) % packageTabs.length;
    const nextTab = packageTabs[nextIndex];

    if (nextTab !== undefined) {
      selectPackageManager(nextTab);
      nextTab.focus();
    }
  });
}

copyButton?.addEventListener("click", async () => {
  if (commandValue === null) {
    return;
  }

  const command = commandValue.textContent?.trim();

  if (command === undefined || command === "") {
    return;
  }

  try {
    await writeClipboard(command);
    showCopyResult("copied to clipboard", "copied");
  } catch {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(commandValue);
    selection?.addRange(range);
    showCopyResult("command selected", "selected");
  }
});

async function writeClipboard(value: string): Promise<void> {
  let timeout: number | undefined;

  try {
    await Promise.race([
      navigator.clipboard.writeText(value),
      new Promise<never>((_resolve, reject) => {
        timeout = window.setTimeout(() => reject(new Error("Clipboard write timed out.")), 300);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
  }
}

function initialTheme(): Theme {
  const saved = window.localStorage.getItem("passkeeper-theme");

  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setTheme(theme: Theme, persist = false): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  themeColor?.setAttribute("content", theme === "dark" ? "#0d0d10" : "#ffffff");

  const nextTheme = theme === "dark" ? "light" : "dark";
  if (themeLabel !== null) {
    themeLabel.textContent = nextTheme;
  }
  themeButton?.setAttribute("aria-label", `Switch to ${nextTheme} theme`);

  if (persist) {
    window.localStorage.setItem("passkeeper-theme", theme);
  }
}

function selectPackageManager(tab: HTMLButtonElement): void {
  const packageManager = tab.dataset.packageManager;

  if (!isPackageManager(packageManager)) {
    return;
  }

  for (const candidate of packageTabs) {
    const selected = candidate === tab;
    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  }

  if (commandValue !== null) {
    commandValue.textContent = installCommands[packageManager];
  }
  clearCopyResult();
}

function isPackageManager(value: string | undefined): value is PackageManager {
  return value === "pnpm" || value === "npm" || value === "bun";
}

function showCopyResult(message: string, buttonLabel: string): void {
  if (copyResetTimer !== undefined) {
    window.clearTimeout(copyResetTimer);
  }

  if (copyStatus !== null) {
    copyStatus.textContent = message;
  }
  if (copyButton !== null) {
    copyButton.textContent = buttonLabel;
  }

  copyResetTimer = window.setTimeout(clearCopyResult, 1800);
}

function clearCopyResult(): void {
  if (copyResetTimer !== undefined) {
    window.clearTimeout(copyResetTimer);
    copyResetTimer = undefined;
  }

  if (copyStatus !== null) {
    copyStatus.textContent = "";
  }
  if (copyButton !== null) {
    copyButton.textContent = "copy";
  }
}
