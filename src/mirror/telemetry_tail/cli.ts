import { tailMirrorTelemetry } from "./tail.js";

export type MirrorTelemetryTailCliOptions = {
  json?: boolean;
  once?: boolean;
  limit?: number;
  path?: string;
  sinceMinutes?: number;
  grep?: string;
  type?: string;
};

export async function runMirrorTelemetryTailCli(
  opts: MirrorTelemetryTailCliOptions,
): Promise<void> {
  await tailMirrorTelemetry({
    json: opts.json,
    once: opts.once,
    limit: opts.limit,
    path: opts.path,
    sinceMinutes: opts.sinceMinutes,
    grep: opts.grep,
    type: opts.type,
  });
}
