import { createMirrorGateway } from "../mirror-gateway/index.js";
import type { MirrorProviderConfig } from "../mirror-provider/index.js";
import {
  createMirrorRuntimeHost,
  startMirrorService,
  type MirrorRuntimeHost,
} from "../mirror-service/index.js";
import { executeMirrorCliCommand, parseMirrorCliArgs } from "./commands.js";
import { formatMirrorCliJsonError } from "./json_output.js";
import { formatMirrorCliResult } from "./output.js";

export async function runMirrorCli(
  argv: string[],
  deps: {
    gateway?: ReturnType<typeof createMirrorGateway>;
    runtimeHost?: MirrorRuntimeHost;
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
    let runtimeHost = deps.runtimeHost;
    let ownsRuntimeHost = false;
    if (!runtimeHost) {
      runtimeHost = await createMirrorRuntimeHost(
        {
          providerUrl: deps.provider?.url,
          providerAuthToken: deps.provider?.authToken,
        },
        { fetchImpl: deps.fetchImpl },
      );
      ownsRuntimeHost = true;
    }

    try {
      const gateway = deps.gateway ?? runtimeHost.gateway;
      const result = await executeMirrorCliCommand(parsed, {
        gateway,
        runtimeHost,
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
    } finally {
      if (ownsRuntimeHost) {
        await runtimeHost.shutdown();
      }
    }
  } catch (error) {
    if (parsed.json) {
      return formatMirrorCliJsonError(parsed.command, error, parsed.action);
    }
    throw error;
  }
}
