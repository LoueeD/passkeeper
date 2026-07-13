import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const packageManager = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager;
assert(typeof packageManager === "string" && packageManager.startsWith("pnpm@"), "packageManager must pin pnpm.");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "passkeeper-package-check-"));
const packageDefinitions = [
  { directory: "packages/core", name: "@passkeeper/core" },
  { directory: "packages/client", name: "@passkeeper/client" },
  { directory: "packages/cloudflare", name: "@passkeeper/cloudflare" },
  {
    directory: "packages/d1",
    name: "@passkeeper/d1",
    extraFiles: ["package/migrations/0001_initial.sql"],
  },
];

try {
  const archives = new Map();

  for (const definition of packageDefinitions) {
    const before = new Set(readdirSync(temporaryDirectory));
    run("pnpm", ["--dir", definition.directory, "pack", "--pack-destination", temporaryDirectory], {
      cwd: root,
    });
    const archiveName = readdirSync(temporaryDirectory).find(
      (file) => file.endsWith(".tgz") && !before.has(file),
    );

    assert(archiveName !== undefined, `pnpm pack did not create an archive for ${definition.name}.`);
    const archive = join(temporaryDirectory, archiveName);
    const files = new Set(run("tar", ["-tzf", archive]).trim().split("\n"));
    const requiredFiles = [
      "package/package.json",
      "package/README.md",
      "package/LICENSE",
      "package/dist/index.js",
      "package/dist/index.d.ts",
      ...(definition.extraFiles ?? []),
    ];

    for (const file of requiredFiles) {
      assert(files.has(file), `${definition.name} archive is missing ${file}.`);
    }

    const manifest = JSON.parse(run("tar", ["-xOzf", archive, "package/package.json"]));
    assert(manifest.name === definition.name, `${definition.name} archive has the wrong package name.`);
    assert(manifest.version !== "0.0.0" || process.env.PASSKEEPER_ALLOW_ZERO_VERSION === "1",
      `${definition.name} must be versioned before publishing. Set PASSKEEPER_ALLOW_ZERO_VERSION=1 for development checks.`);
    assert(manifest.description?.trim(), `${definition.name} must have a package description.`);
    assert(manifest.license === "MIT", `${definition.name} archive must declare the MIT license.`);
    assert(manifest.type === "module", `${definition.name} must declare ESM package semantics.`);
    assert(manifest.sideEffects === false, `${definition.name} must declare sideEffects as false.`);
    assert(manifest.main === "./dist/index.js", `${definition.name} has an unexpected main entrypoint.`);
    assert(manifest.module === "./dist/index.js", `${definition.name} has an unexpected module entrypoint.`);
    assert(manifest.types === "./dist/index.d.ts", `${definition.name} has an unexpected types entrypoint.`);
    assert(manifest.exports?.["."]?.import === "./dist/index.js",
      `${definition.name} must export its ESM entrypoint.`);
    assert(manifest.exports?.["."]?.types === "./dist/index.d.ts",
      `${definition.name} must export its declaration entrypoint.`);
    assert(manifest.publishConfig?.access === "public", `${definition.name} must publish publicly.`);
    assert(Array.isArray(manifest.keywords) && manifest.keywords.length > 0,
      `${definition.name} must include package keywords.`);

    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      assert(!version.includes("workspace:"), `${definition.name} contains a workspace dependency for ${dependency}.`);
      assert(!version.startsWith("file:") && !version.startsWith("link:"),
        `${definition.name} contains a local dependency for ${dependency}.`);
    }

    archives.set(definition.name, archive);
  }

  if (process.env.PASSKEEPER_VERIFY_CONSUMER === "1") {
    const consumerDirectory = join(temporaryDirectory, "consumer");
    mkdirSync(consumerDirectory);
    writeFileSync(
      join(consumerDirectory, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          type: "module",
          packageManager,
          dependencies: Object.fromEntries(
            [...archives].map(([name, archive]) => [name, `file:${archive}`]),
          ),
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(consumerDirectory, "pnpm-workspace.yaml"),
      `overrides:\n${[...archives]
        .map(([name, archive]) => `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${archive}`)}`)
        .join("\n")}\n`,
    );
    run("corepack", ["pnpm", "install", "--prefer-offline", "--ignore-scripts", "--no-frozen-lockfile"], {
      cwd: consumerDirectory,
    });
    run(
      "node",
      [
        "--input-type=module",
        "--eval",
        `await Promise.all(${JSON.stringify(packageDefinitions.map(({ name }) => name))}.map((name) => import(name)));`,
      ],
      { cwd: consumerDirectory },
    );
  }

  process.stdout.write(
    `Verified ${packageDefinitions.length} package archives${
      process.env.PASSKEEPER_VERIFY_CONSUMER === "1" ? " and clean-package imports" : ""
    }.\n`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }

  return result.stdout;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
