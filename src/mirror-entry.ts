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
import { runMirrorOnboard, type MirrorOnboardOptions } from "./mirror-local/onboard.js";
import { runMirrorTui } from "./mirror-local/tui.js";
import { runMirrorWeb } from "./mirror-local/web.js";
import type { MirrorService } from "./mirror-service/index.js";

function readOptionValue(args: string[], name: string): string | undefined {
  const direct = args.find((value) => value.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }
  const index = args.findIndex((value) => value === name);
  if (index >= 0) {
    return args[index + 1];
  }
  return undefined;
}

function parseMirrorOnboardArgs(args: string[]): MirrorOnboardOptions {
  const providerMode = readOptionValue(args, "--provider");
  const telegramMode = readOptionValue(args, "--telegram");
  return {
    yes: args.includes("--yes"),
    providerMode:
      providerMode === "ollama" || providerMode === "openai" || providerMode === "skip"
        ? providerMode
        : undefined,
    providerUrl: readOptionValue(args, "--provider-url"),
    providerToken: readOptionValue(args, "--provider-token"),
    providerModel: readOptionValue(args, "--provider-model"),
    port: Number.parseInt(readOptionValue(args, "--port") || "", 10) || undefined,
    workspaceRoot: readOptionValue(args, "--workspace-root"),
    telegramMode:
      telegramMode === "configure" || telegramMode === "skip" ? telegramMode : undefined,
    telegramToken: readOptionValue(args, "--telegram-token"),
    installService: args.includes("--install-service")
      ? true
      : args.includes("--skip-service")
        ? false
        : undefined,
  };
}

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
  )
    .concat([
      "  onboard   Launch the local first-run setup wizard for Mirror Runtime.",
      "  start     Alias for `mirror serve`.",
      "  tui       Open the local terminal UI against the running Mirror runtime.",
      "  web       Open the local browser UI route for the running Mirror runtime.",
      "  console   Alias for `mirror web`.",
    ])
    .join("\n");

  return `Mirror Runtime

Usage:
  mirror help [command]
  mirror <command> [options]

Commands:
${commandSummary}

Environment:
  Structured settings live under ~/.mirror/config/
  MIRROR_PORT / MIRROR_NODE_ID / MIRROR_BASE_URL remain explicit overrides
  MIRROR_OPERATOR_TOKEN / MIRROR_LORE_DIR remain bootstrap or advanced overrides
 
Automation:
  Prefer --json for stable machine-readable output.
  Write-capable commands require MIRROR_OPERATOR_TOKEN or --operator-token.

Compatibility:
  \`openclaw mirror ...\` remains available for compatibility-only diagnostics flows.
`;
}

export async function runMirrorEntry(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const normalizedArgs = [...args];
  const firstCommandIndex = normalizedArgs.findIndex((value) => !value.startsWith("-"));
  if (firstCommandIndex >= 0 && normalizedArgs[firstCommandIndex] === "start") {
    normalizedArgs[firstCommandIndex] = "serve";
  }
  if (firstCommandIndex >= 0 && normalizedArgs[firstCommandIndex] === "console") {
    normalizedArgs[firstCommandIndex] = "web";
  }
  if (
    normalizedArgs.length === 0 ||
    normalizedArgs[0] === "help" ||
    normalizedArgs.includes("--help") ||
    normalizedArgs.includes("-h")
  ) {
    const commandName =
      normalizedArgs[0] === "help"
        ? normalizedArgs[1]
        : (normalizedArgs.find((value, index) => index > 0 && !value.startsWith("--")) ??
          normalizedArgs[0]);
    process.stdout.write(`${buildMirrorHelp(commandName)}\n`);
    return 0;
  }

  const commandName = normalizedArgs.find((value) => !value.startsWith("-"));
  if (commandName === "onboard") {
    process.stdout.write(await runMirrorOnboard(parseMirrorOnboardArgs(normalizedArgs)));
    return 0;
  }
  if (commandName === "tui") {
    return await runMirrorTui();
  }
  if (commandName === "web") {
    process.stdout.write(
      await runMirrorWeb({ openBrowser: !normalizedArgs.includes("--no-open") }),
    );
    return 0;
  }
  if (commandName === "serve") {
    let service: MirrorService | undefined;
    const output = await runMirrorCli(normalizedArgs, {
      onServiceStarted(startedService) {
        service = startedService;
      },
    });
    process.stdout.write(output);
    if (service) {
      await holdMirrorServiceUntilSignal(service);
    }
    return 0;
  }

  const output = await runMirrorCli(normalizedArgs);
  process.stdout.write(output);
  return 0;
}

export async function holdMirrorServiceUntilSignal(service: MirrorService): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const keepAliveTimer = setInterval(() => {}, 60_000);
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    let settled = false;

    const cleanup = () => {
      clearInterval(keepAliveTimer);
      for (const signal of signals) {
        process.off(signal, onSignal);
      }
    };

    const onSignal = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      void service.shutdown().then(resolve, reject);
    };

    for (const signal of signals) {
      process.on(signal, onSignal);
    }
  });
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
