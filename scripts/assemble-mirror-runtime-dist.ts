import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";

type RootPackageJson = {
  version: string;
  description?: string;
  license?: string;
  type?: string;
  engines?: Record<string, string>;
  packageManager?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const root = process.cwd();
const distRoot = path.join(root, "dist");
const outputRoot = path.join(distRoot, "mirror-runtime-linux");
const archivePath = path.join(distRoot, "mirror-runtime-linux.tar.gz");
const rootfsRoot = path.join(outputRoot, "rootfs");
const runtimeRoot = path.join(rootfsRoot, "opt", "mirror-runtime");
const systemdRoot = path.join(rootfsRoot, "usr", "lib", "systemd", "user");
const packageAssetsRoot = path.join(root, "packaging", "mirror-runtime");
const workspaceNodeModulesRoot = path.join(root, "node_modules");

const requiredDistFiles = ["mirror-entry.js", "mirror-package.js", "schema.sql"] as const;

async function ensureRequiredDistFiles(): Promise<void> {
  for (const file of requiredDistFiles) {
    const fullPath = path.join(distRoot, file);
    await fs.access(fullPath);
  }
}

async function copyFileToRuntime(relativeSource: string, relativeTarget: string): Promise<void> {
  const source = path.join(root, relativeSource);
  const target = path.join(runtimeRoot, relativeTarget);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyFileToOutput(relativeSource: string, relativeTarget: string): Promise<void> {
  const source = path.join(root, relativeSource);
  const target = path.join(outputRoot, relativeTarget);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function writeLauncherScript(): Promise<void> {
  const launcherPath = path.join(runtimeRoot, "bin", "mirror");
  const content = `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="$(cd "\${SCRIPT_DIR}/.." && pwd)"
exec node "\${RUNTIME_ROOT}/dist/mirror-entry.js" "$@"
`;
  await fs.mkdir(path.dirname(launcherPath), { recursive: true });
  await fs.writeFile(launcherPath, content, "utf8");
  await fs.chmod(launcherPath, 0o755);
}

async function copyRuntimeDependencies(): Promise<void> {
  await fs.access(workspaceNodeModulesRoot);
  await fs.cp(workspaceNodeModulesRoot, path.join(runtimeRoot, "node_modules"), {
    recursive: true,
    force: true,
    verbatimSymlinks: true,
  });
}

async function readRootPackageJson(): Promise<RootPackageJson> {
  const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
  return JSON.parse(raw) as RootPackageJson;
}

async function writeRuntimePackageJson(pkg: RootPackageJson): Promise<void> {
  const runtimePackageJson = {
    name: "mirror-runtime-standalone",
    private: true,
    version: pkg.version,
    description: pkg.description ?? "Mirror Runtime standalone runtime payload",
    license: pkg.license ?? "MIT",
    type: pkg.type ?? "module",
    bin: {
      mirror: "bin/mirror",
    },
    main: "dist/mirror-package.js",
    dependencies: pkg.dependencies ?? {},
    optionalDependencies: pkg.optionalDependencies ?? {},
    engines: pkg.engines ?? {},
    packageManager: pkg.packageManager,
  };
  await fs.writeFile(
    path.join(runtimeRoot, "package.json"),
    `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
    "utf8",
  );
}

async function writeManifest(pkg: RootPackageJson): Promise<void> {
  const manifest = {
    schema_version: 1,
    package_name: "mirror-runtime-linux",
    version: pkg.version,
    archive: "mirror-runtime-linux.tar.gz",
    runtime_root: "rootfs/opt/mirror-runtime",
    service_unit: "rootfs/usr/lib/systemd/user/mirror-runtime.service",
    bootstrap_script: "install-mirror-runtime.sh",
    required_runtime_files: [
      "install-mirror-runtime.sh",
      "rootfs/opt/mirror-runtime/bin/mirror",
      "rootfs/opt/mirror-runtime/mirror.mjs",
      "rootfs/opt/mirror-runtime/dist/mirror-entry.js",
      "rootfs/opt/mirror-runtime/dist/mirror-package.js",
      "rootfs/opt/mirror-runtime/dist/schema.sql",
      "rootfs/opt/mirror-runtime/node_modules",
      "rootfs/opt/mirror-runtime/package.json",
    ],
    conventions: {
      config_dir: "~/.config/mirror-runtime",
      data_dir: "~/.local/share/mirror-runtime",
      lore_dir: "~/.local/share/mirror-runtime/lore-scrolls",
      state_dir: "~/.local/state/mirror-runtime",
      memory_db_path: "~/.local/state/mirror-runtime/mirror-memory.db",
      logs: "journald via systemd user service",
    },
    verification_commands: [
      "/opt/mirror-runtime/bin/mirror help",
      "/opt/mirror-runtime/bin/mirror serve --json",
    ],
  };
  await fs.writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function writeArchive(): Promise<void> {
  await fs.rm(archivePath, { force: true });
  await tar.create(
    {
      cwd: distRoot,
      file: archivePath,
      gzip: true,
      portable: false,
    },
    ["mirror-runtime-linux"],
  );
}

async function main(): Promise<void> {
  await ensureRequiredDistFiles();
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.mkdir(systemdRoot, { recursive: true });

  const pkg = await readRootPackageJson();

  await copyFileToRuntime("mirror.mjs", "mirror.mjs");
  await writeLauncherScript();
  for (const file of requiredDistFiles) {
    await copyFileToRuntime(path.join("dist", file), path.join("dist", file));
  }
  await copyRuntimeDependencies();
  await copyFileToRuntime(
    path.relative(root, path.join(packageAssetsRoot, "mirror-runtime.env.example")),
    path.join("share", "examples", "mirror-runtime.env.example"),
  );
  await copyFileToRuntime(
    path.relative(root, path.join(packageAssetsRoot, "README.md")),
    path.join("share", "docs", "STANDALONE_BOUNDARY.md"),
  );

  await fs.copyFile(
    path.join(packageAssetsRoot, "mirror-runtime.service"),
    path.join(systemdRoot, "mirror-runtime.service"),
  );
  await copyFileToOutput(
    path.relative(root, path.join(packageAssetsRoot, "install-mirror-runtime.sh")),
    "install-mirror-runtime.sh",
  );
  await fs.chmod(path.join(outputRoot, "install-mirror-runtime.sh"), 0o755);

  await writeRuntimePackageJson(pkg);
  await writeManifest(pkg);
  await writeArchive();

  process.stdout.write(`${path.relative(root, outputRoot)}\n`);
}

void main().catch((error) => {
  console.error(
    "[assemble-mirror-runtime-dist]",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
