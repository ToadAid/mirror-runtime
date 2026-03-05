import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { appendTelemetrySinkEventFromEnv } from "../telemetry_sinks/ndjson_sink.js";
import { formatMirrorNudgeTelemetry, isMirrorNudgeTelemetry } from "./mirror_nudge_observer.js";

export type MirrorTelemetryObserverCliOptions = {
  json?: boolean;
};

function parseArgs(argv: string[]): MirrorTelemetryObserverCliOptions {
  return {
    json: argv.includes("--json"),
  };
}

type ProcessMirrorTelemetryObserverLineOptions = {
  jsonMode?: boolean;
  lineNumber?: number;
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
  stdoutLine?: (message: string) => void;
  stdoutWrite?: (message: string) => void;
};

export async function processMirrorTelemetryObserverLine(
  line: string,
  options: ProcessMirrorTelemetryObserverLineOptions = {},
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let evt: unknown;
  try {
    evt = JSON.parse(trimmed) as unknown;
  } catch {
    const warn = options.warn ?? console.error;
    const lineNumber = options.lineNumber ?? 0;
    const suffix = lineNumber > 0 ? ` ${lineNumber}` : "";
    warn(`Skipping malformed JSON line${suffix}`);
    return;
  }

  if (isMirrorNudgeTelemetry(evt)) {
    await appendTelemetrySinkEventFromEnv(evt.data, options.env ?? process.env);
  }

  if (options.jsonMode) {
    const stdoutLine = options.stdoutLine ?? console.log;
    stdoutLine(JSON.stringify(evt));
    return;
  }

  if (isMirrorNudgeTelemetry(evt)) {
    const stdoutWrite = options.stdoutWrite ?? process.stdout.write.bind(process.stdout);
    stdoutWrite(formatMirrorNudgeTelemetry(evt));
  }
}

export async function runMirrorTelemetryObserverCli(argv: string[] = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  try {
    let lineNumber = 0;
    for await (const line of rl) {
      lineNumber += 1;
      await processMirrorTelemetryObserverLine(line, {
        jsonMode: opts.json,
        lineNumber,
      });
    }
  } finally {
    rl.close();
  }
}

const argvEntry = process.argv[1];
if (argvEntry && import.meta.url === pathToFileURL(argvEntry).href) {
  await runMirrorTelemetryObserverCli();
}
