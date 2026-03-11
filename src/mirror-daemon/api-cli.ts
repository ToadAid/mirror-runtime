import type { Command } from "commander";
import { formatMirrorDaemonCliError } from "./cli-errors.js";
import {
  consultOcean,
  fetchOceanPond,
  getOceanStatus,
  getPondManifest,
  listOceanPonds,
  refreshPond,
  type MirrorDaemonTrustStatus,
  updateOceanTrust,
} from "./client.js";

type CommandOptions = {
  baseUrl?: string;
  json?: boolean;
};

function printOutput(payload: unknown, json: boolean): void {
  const output = json ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  process.stdout.write(`${output}\n`);
}

function parseTrustStatus(value: string): MirrorDaemonTrustStatus {
  if (value === "known" || value === "trusted" || value === "blocked") {
    return value;
  }
  throw new Error("trust_status must be one of: known, trusted, blocked");
}

function parseQueryInput(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function runClientCommand(
  action: string,
  json: boolean,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    const payload = await run();
    printOutput(payload, json);
  } catch (error) {
    throw formatMirrorDaemonCliError(action, error);
  }
}

export function registerMirrorApiCli(mirror: Command): void {
  const api = mirror.command("api").description("MirrorDaemon Pond/Ocean API commands");
  const pond = api.command("pond").description("Pond API");
  const ocean = api.command("ocean").description("Ocean API");

  pond
    .command("manifest")
    .description("Call GET /pond/manifest")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      await runClientCommand("mirror api pond manifest", opts.json === true, async () => {
        return await getPondManifest({ baseUrl: opts.baseUrl });
      });
    });

  pond
    .command("refresh")
    .description("Call POST /pond/refresh")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      await runClientCommand("mirror api pond refresh", opts.json === true, async () => {
        return await refreshPond({ baseUrl: opts.baseUrl });
      });
    });

  ocean
    .command("ponds")
    .description("Call GET /ocean/ponds")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      await runClientCommand("mirror api ocean ponds", opts.json === true, async () => {
        return await listOceanPonds({ baseUrl: opts.baseUrl });
      });
    });

  ocean
    .command("fetch")
    .description("Call POST /ocean/ponds/fetch")
    .argument("<url>", "Manifest URL")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (manifestUrl: string, opts: CommandOptions) => {
      await runClientCommand("mirror api ocean fetch", opts.json === true, async () => {
        return await fetchOceanPond(manifestUrl, { baseUrl: opts.baseUrl });
      });
    });

  ocean
    .command("trust")
    .description("Call POST /ocean/ponds/trust")
    .argument("<pond_id>", "Pond ID")
    .argument("<status>", "Trust status: known|trusted|blocked")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (pondId: string, status: string, opts: CommandOptions) => {
      await runClientCommand("mirror api ocean trust", opts.json === true, async () => {
        return await updateOceanTrust(pondId, parseTrustStatus(status), {
          baseUrl: opts.baseUrl,
        });
      });
    });

  ocean
    .command("consult")
    .description("Call POST /ocean/consult")
    .argument("<pond_id>", "Pond ID")
    .argument("<query>", "Query payload (JSON or plain string)")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (pondId: string, query: string, opts: CommandOptions) => {
      await runClientCommand("mirror api ocean consult", opts.json === true, async () => {
        return await consultOcean(pondId, parseQueryInput(query), {
          baseUrl: opts.baseUrl,
        });
      });
    });

  ocean
    .command("status")
    .description("Call GET /ocean/status")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      await runClientCommand("mirror api ocean status", opts.json === true, async () => {
        return await getOceanStatus({ baseUrl: opts.baseUrl });
      });
    });
}
