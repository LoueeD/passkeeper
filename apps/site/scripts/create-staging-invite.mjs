import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const appDirectory = resolve(import.meta.dirname, "..");
const wrangler = resolve(appDirectory, "node_modules/.bin/wrangler");
const code = randomBytes(24).toString("base64url");
const codeHash = createHash("sha256").update(code).digest("hex");
const id = randomUUID();
const createdAt = new Date().toISOString();
const sql = [
  "insert into passkeeper_invites (id, code_hash, max_uses, used_count, created_at)",
  `values ('${id}', '${codeHash}', 1, 0, '${createdAt}');`,
].join(" ");
const result = spawnSync(
  wrangler,
  [
    "d1", "execute", "passkeeper-site-demo-staging", "--remote",
    "--config", "wrangler.staging.jsonc", "--command", sql,
  ],
  {
    cwd: appDirectory,
    encoding: "utf8",
    env: process.env,
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  throw new Error(`Creating the staging invite failed with exit code ${result.status}.`);
}

process.stdout.write("Created a one-use staging invite. Store this value now; it will not be shown again:\n");
process.stdout.write(`${code}\n`);
