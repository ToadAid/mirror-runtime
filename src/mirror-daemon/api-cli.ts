import type { Command } from "commander";
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
      const payload = await getPondManifest({ baseUrl: opts.baseUrl });
      printOutput(payload, opts.json === true);
    });

  pond
    .command("refresh")
    .description("Call POST /pond/refresh")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      const payload = await refreshPond({ baseUrl: opts.baseUrl });
      printOutput(payload, opts.json === true);
    });

  ocean
    .command("ponds")
    .description("Call GET /ocean/ponds")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      const payload = await listOceanPonds({ baseUrl: opts.baseUrl });
      printOutput(payload, opts.json === true);
    });

  ocean
    .command("fetch")
    .description("Call POST /ocean/ponds/fetch")
    .argument("<url>", "Manifest URL")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (manifestUrl: string, opts: CommandOptions) => {
      const payload = await fetchOceanPond(manifestUrl, { baseUrl: opts.baseUrl });
      printOutput(payload, opts.json === true);
    });

  ocean
    .command("trust")
    .description("Call POST /ocean/ponds/trust")
    .argument("<pond_id>", "Pond ID")
    .argument("<status>", "Trust status: known|trusted|blocked")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (pondId: string, status: string, opts: CommandOptions) => {
      const payload = await updateOceanTrust(pondId, parseTrustStatus(status), {
        baseUrl: opts.baseUrl,
      });
      printOutput(payload, opts.json === true);
    });

  ocean
    .command("consult")
    .description("Call POST /ocean/consult")
    .argument("<pond_id>", "Pond ID")
    .argument("<query>", "Query payload (JSON or plain string)")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (pondId: string, query: string, opts: CommandOptions) => {
      const payload = await consultOcean(pondId, parseQueryInput(query), {
        baseUrl: opts.baseUrl,
      });
      printOutput(payload, opts.json === true);
    });

  ocean
    .command("status")
    .description("Call GET /ocean/status")
    .option("--base-url <url>", "MirrorDaemon base URL")
    .option("--json", "Output compact JSON", false)
    .action(async (opts: CommandOptions) => {
      const payload = await getOceanStatus({ baseUrl: opts.baseUrl });
      printOutput(payload, opts.json === true);
    });
}
