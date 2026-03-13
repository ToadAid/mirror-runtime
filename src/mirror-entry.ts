#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./infra/dotenv.js";
import { normalizeEnv } from "./infra/env.js";
import { formatUncaughtError } from "./infra/errors.js";
import { isMainModule } from "./infra/is-main.js";
import { assertSupportedRuntime } from "./infra/runtime-guard.js";
import { runMirrorCli } from "./mirror-cli/index.js";
import { MIRROR_CLI_COMMAND_HELP } from "./mirror-cli/schemas.js";

function buildMirrorHelp(commandName?: string): string {
  const command = commandName
    ? MIRROR_CLI_COMMAND_HELP.find((entry) => entry.command === commandName)
    : undefined;
  if (command) {
    return `Mirror Runtime

${command.command}
  ${command.description}

Usage:
  ${command.usage}

Arguments:
${command.args.length > 0 ? command.args.map((arg) => `  - ${arg}`).join("\n") : "  - none"}

Options:
${command.options.map((option) => `  - ${option}`).join("\n")}

Auth:
  ${command.auth === "operator" ? "operator token required" : "open"}
`;
  }

  const commandSummary = MIRROR_CLI_COMMAND_HELP.map(
    (entry) => `  ${entry.command.padEnd(9)} ${entry.description}`,
  ).join("\n");

  return `Mirror Runtime

Usage:
  mirror help [command]
  mirror <command> [options]

Commands:
${commandSummary}

Environment:
  MIRROR_PROVIDER_URL
  MIRROR_PROVIDER_AUTH_TOKEN
  MIRROR_OPERATOR_TOKEN
  MIRROR_LORE_DIR
 
Automation:
  Prefer --json for stable machine-readable output.
  Write-capable commands require MIRROR_OPERATOR_TOKEN or --operator-token.

Compatibility:
  \`openclaw mirror ...\` remains available for compatibility-only diagnostics flows.
`;
}

export async function runMirrorEntry(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "help" || args.includes("--help") || args.includes("-h")) {
    const commandName =
      args[0] === "help"
        ? args[1]
        : (args.find((value, index) => index > 0 && !value.startsWith("--")) ?? args[0]);
    process.stdout.write(`${buildMirrorHelp(commandName)}\n`);
    return 0;
  }

  const output = await runMirrorCli(args);
  process.stdout.write(output);
  return 0;
}

if (isMainModule({ currentFile: fileURLToPath(import.meta.url) })) {
  loadDotEnv({ quiet: true });
  normalizeEnv();
  assertSupportedRuntime();
  process.title = "mirror";

  void runMirrorEntry(process.argv).catch((error) => {
    console.error("[mirror] CLI failed:", formatUncaughtError(error));
    process.exitCode = 1;
  });
}
