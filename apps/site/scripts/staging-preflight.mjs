import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse, printParseErrorCode } from "jsonc-parser";

const appDirectory = resolve(import.meta.dirname, "..");
const configPath = resolve(appDirectory, "wrangler.staging.jsonc");
const shouldDeploy = process.argv.includes("--deploy");
const config = readConfig(configPath, "staging Wrangler JSONC");

assert(config?.name === "passkeeper-site-staging", "staging Worker name is not isolated");
assert(config?.main === "worker/index.ts", "staging Worker entrypoint is incorrect");
assertRecentCompatibilityDate(config?.compatibility_date);
assert(config?.observability?.enabled === true, "staging observability must be enabled");
assert(
  typeof config?.observability?.head_sampling_rate === "number" &&
    config.observability.head_sampling_rate > 0,
  "staging observability sampling must be enabled",
);
assert(
  Array.isArray(config?.assets?.run_worker_first) &&
    config.assets.run_worker_first.includes("/demo/auth/*"),
  "the embedded demo API must run through the Worker",
);
assert(
  Array.isArray(config?.triggers?.crons) && config.triggers.crons.length > 0,
  "staging scheduled cleanup trigger is required",
);

const rpId = requireConfiguredString(config?.vars?.RP_ID, "RP_ID");
const originValue = requireConfiguredString(config?.vars?.RP_ORIGIN, "RP_ORIGIN");
const origin = new URL(originValue);
assert(origin.protocol === "https:", "staging RP_ORIGIN must use HTTPS");
assert(origin.origin === originValue, "staging RP_ORIGIN must not include a path, query, or fragment");
assert(
  origin.hostname === rpId || origin.hostname.endsWith(`.${rpId}`),
  "staging RP_ID must match RP_ORIGIN or be its parent domain",
);

assert(Array.isArray(config?.d1_databases), "staging D1 binding is missing");
assert(config.d1_databases.length === 1, "staging must define exactly one D1 binding");
const database = config.d1_databases[0];
assert(database?.binding === "DB", "staging D1 binding must be named DB");
assert(
  database?.database_name === "passkeeper-site-demo-staging",
  "staging D1 database name is not isolated",
);
assert(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    requireConfiguredString(database?.database_id, "D1 database_id"),
  ),
  "staging D1 database_id must be a Cloudflare UUID",
);
assert(
  database?.migrations_dir === "../../packages/d1/migrations",
  "staging D1 migrations_dir must reference the package migrations",
);

run(resolve(appDirectory, "node_modules/.bin/vite"), ["build", "--mode", "staging"]);

const generatedConfigPath = findGeneratedConfig(resolve(appDirectory, "dist"));
const generatedConfig = readConfig(generatedConfigPath, "generated Wrangler config");
assert(generatedConfig?.name === config.name, "generated Worker name does not match staging");
assert(
  typeof generatedConfig?.assets?.directory === "string",
  "generated deployment is missing the built client assets",
);
assert(
  generatedConfig?.assets?.run_worker_first?.includes("/demo/auth/*"),
  "generated deployment does not route the demo API through the Worker",
);

const wrangler = resolve(appDirectory, "node_modules/.bin/wrangler");
if (shouldDeploy) {
  run(wrangler, ["deploy", "--config", generatedConfigPath]);
  process.stdout.write("Validated and deployed the embedded staging demo.\n");
} else {
  const outputDirectory = mkdtempSync(join(tmpdir(), "passkeeper-site-staging-dry-run-"));
  try {
    run(wrangler, ["deploy", "--dry-run", "--config", generatedConfigPath, "--outdir", outputDirectory]);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
  process.stdout.write("Validated staging bindings, client assets, and Worker deployment bundle.\n");
}

function findGeneratedConfig(distDirectory) {
  const matches = readdirSync(distDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(distDirectory, entry.name, "wrangler.json"))
    .filter((path) => {
      try {
        readFileSync(path);
        return true;
      } catch {
        return false;
      }
    });
  assert(matches.length === 1, "Vite must emit exactly one Worker deployment config");
  return matches[0];
}

function readConfig(path, label) {
  const parseErrors = [];
  const value = parse(readFileSync(path, "utf8"), parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (parseErrors.length > 0) {
    const details = parseErrors
      .map((error) => `${printParseErrorCode(error.error)} at byte ${error.offset}`)
      .join(", ");
    throw new Error(`Invalid ${label}: ${details}.`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appDirectory,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}.`);
  }
}

function requireConfiguredString(value, field) {
  assert(typeof value === "string" && value.trim() !== "", `${field} must be configured`);
  assert(!value.includes("REPLACE_WITH_"), `${field} still contains a placeholder`);
  return value.trim();
}

function assertRecentCompatibilityDate(value) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value), "compatibility_date is invalid");
  const date = new Date(`${value}T00:00:00.000Z`);
  const ageDays = (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
  assert(!Number.isNaN(date.getTime()) && ageDays >= 0 && ageDays <= 30, "compatibility_date must be within the last 30 days");
}

function assert(condition, message) {
  if (!condition) throw new Error(`Staging preflight failed: ${message}.`);
}
