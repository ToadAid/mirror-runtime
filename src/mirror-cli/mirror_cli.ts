import { createMirrorGateway } from "../mirror-gateway/index.js";
import type { MirrorProviderConfig } from "../mirror-provider/index.js";
import { startMirrorService } from "../mirror-service/index.js";
import { executeMirrorCliCommand, parseMirrorCliArgs } from "./commands.js";
import { formatMirrorCliJsonError } from "./json_output.js";
import { formatMirrorCliResult } from "./output.js";

export async function runMirrorCli(
  argv: string[],
  deps: {
    gateway?: ReturnType<typeof createMirrorGateway>;
    provider?: MirrorProviderConfig;
    fetchImpl?: typeof fetch;
    onServiceStarted?: (service: Awaited<ReturnType<typeof startMirrorService>>) => void;
  } = {},
): Promise<string> {
  const wantsJson = argv.includes("--json");
  let parsed;
  try {
    parsed = parseMirrorCliArgs(argv);
  } catch (error) {
    if (wantsJson) {
      return formatMirrorCliJsonError(null, error);
    }
    throw error;
  }
  try {
    const gateway = deps.gateway ?? createMirrorGateway();
    const result = await executeMirrorCliCommand(parsed, {
      gateway,
      provider: deps.provider,
      fetchImpl: deps.fetchImpl,
      startService: (opts) =>
        startMirrorService(
          {
            port: opts.port,
          },
          { fetchImpl: deps.fetchImpl },
        ),
    });
    if (result.kind === "serve") {
      deps.onServiceStarted?.(result.service);
    }
    return formatMirrorCliResult(result, parsed.json);
  } catch (error) {
    if (parsed.json) {
      return formatMirrorCliJsonError(parsed.command, error, parsed.action);
    }
    throw error;
  }
}
