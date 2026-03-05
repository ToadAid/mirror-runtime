import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { formatMirrorNudgeTelemetry, isMirrorNudgeTelemetry } from "./mirror_nudge_observer.js";

export type MirrorTelemetryObserverCliOptions = {
  json?: boolean;
};

function parseArgs(argv: string[]): MirrorTelemetryObserverCliOptions {
  return {
    json: argv.includes("--json"),
  };
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
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let evt: unknown;
      try {
        evt = JSON.parse(trimmed) as unknown;
      } catch {
        console.error(`Skipping malformed JSON line ${lineNumber}`);
        continue;
      }

      if (opts.json) {
        console.log(JSON.stringify(evt));
        continue;
      }

      if (isMirrorNudgeTelemetry(evt)) {
        process.stdout.write(formatMirrorNudgeTelemetry(evt));
      }
    }
  } finally {
    rl.close();
  }
}

const argvEntry = process.argv[1];
if (argvEntry && import.meta.url === pathToFileURL(argvEntry).href) {
  await runMirrorTelemetryObserverCli();
}
