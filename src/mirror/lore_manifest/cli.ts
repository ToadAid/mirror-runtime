import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveDefaultLoreRoot } from "../lore_sources/policy.js";
import type {
  MirrorLoreManifest,
  MirrorLoreManifestVerificationReport,
  RunVerifyLoreCliOptions,
} from "./types.js";
import { verifyLoreManifest } from "./verify.js";

export function resolveDefaultLoreManifestPath(explicitLoreDir?: string): string {
  return path.join(resolveDefaultLoreRoot(explicitLoreDir), "manifest.json");
}

export const DEFAULT_LORE_MANIFEST_PATH = resolveDefaultLoreManifestPath();
export const DEFAULT_LORE_CANONICAL_DIR = resolveDefaultLoreRoot();

export function formatVerifyLoreHuman(
  manifestPath: string,
  dir: string,
  report: MirrorLoreManifestVerificationReport,
): string {
  const lines = [
    "🪞 Lore Verification",
    "",
    `Manifest: ${manifestPath}`,
    `Directory: ${dir}`,
    "",
    `Checked: ${report.checked}`,
    `Matched: ${report.matched}`,
    `Missing: ${report.missing.length}`,
    `Mismatched: ${report.mismatched.length}`,
    "",
    `Status: ${report.ok ? "VERIFIED" : "NOT VERIFIED"}`,
  ];

  if (report.missing.length > 0) {
    lines.push("");
    lines.push("Missing files:");
    for (const filePath of report.missing) {
      lines.push(`- ${filePath}`);
    }
  }

  if (report.mismatched.length > 0) {
    lines.push("");
    lines.push("Mismatched files:");
    for (const mismatch of report.mismatched) {
      lines.push(`- ${mismatch.path}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runVerifyLoreCli(opts: RunVerifyLoreCliOptions = {}): Promise<void> {
  const dir = opts.dir ?? resolveDefaultLoreRoot();
  const manifestPath = opts.manifestPath ?? resolveDefaultLoreManifestPath(dir);
  const write = opts.write ?? ((text: string) => process.stdout.write(text));
  const readManifestFile = opts.readFile ?? readFile;

  const manifestRaw = await readManifestFile(manifestPath, "utf8");

  let manifest: MirrorLoreManifest;
  try {
    manifest = JSON.parse(manifestRaw) as MirrorLoreManifest;
  } catch (error) {
    throw new Error(`Invalid lore manifest JSON at ${manifestPath}: ${(error as Error).message}`, {
      cause: error,
    });
  }

  const report = await verifyLoreManifest({
    manifest,
    baseDir: dir,
  });

  if (opts.json) {
    write(
      `${JSON.stringify({
        manifestPath,
        directory: dir,
        ...report,
      })}\n`,
    );
    return;
  }

  write(formatVerifyLoreHuman(manifestPath, dir, report));
}
