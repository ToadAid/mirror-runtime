/**
 * Compatibility-only OpenClaw CLI wrapper for legacy `openclaw mirror ...` commands.
 *
 * Canonical operator flows live under the standalone `mirror` binary.
 */

import type { Command } from "commander";
import { runMirrorTelemetryTailCli } from "../../../mirror/telemetry_tail/index.js";

function parseLimit(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --limit: ${raw}`);
  }
  return value;
}

export function registerMirrorCli(program: Command): void {
  const mirror = program
    .command("mirror")
    .description("Compatibility-only Mirror diagnostics and telemetry tools");
  const telemetry = mirror
    .command("telemetry")
    .description("Compatibility-only Mirror telemetry commands");

  telemetry
    .command("tail")
    .description("Tail local mirror telemetry sink (mirror.nudge)")
    .option("--json", "Output matched events as JSON", false)
    .option("--limit <n>", "Backlog event count before follow mode", parseLimit, 20)
    .option("--once", "Print backlog and exit", false)
    .option("--path <path>", "Telemetry sink path (overrides env/default)")
    .action(async (opts: { json?: boolean; limit?: number; once?: boolean; path?: string }) => {
      await runMirrorTelemetryTailCli({
        json: opts.json === true,
        limit: opts.limit,
        once: opts.once === true,
        path: opts.path,
      });
    });
}
