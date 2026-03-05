import { tailMirrorTelemetry } from "./tail.js";

export type MirrorTelemetryTailCliOptions = {
  json?: boolean;
  once?: boolean;
  limit?: number;
  path?: string;
};

export async function runMirrorTelemetryTailCli(
  opts: MirrorTelemetryTailCliOptions,
): Promise<void> {
  await tailMirrorTelemetry({
    json: opts.json,
    once: opts.once,
    limit: opts.limit,
    path: opts.path,
  });
}
