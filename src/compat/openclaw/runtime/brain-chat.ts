/**
 * Compatibility-only OpenClaw brain chat proxy.
 *
 * Canonical Mirror chat execution lives in `src/mirror-service/`.
 */

import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { FetchLike } from "../../../mirror-provider/index.js";
import { createMirrorRuntimeHost } from "../../../mirror-service/index.js";
import type { RuntimeEnv } from "../../../runtime.js";
import {
  buildCompatBrainChatEnvelope,
  type CompatChatRequest,
  type CompatChatResponse,
  prepareCompatBrainChatRequest,
  withMirrorCompatLogLevel,
} from "./brain_chat_compat.js";

export async function handleBrainChatEndpoint(
  env: RuntimeEnv,
  brainUrl: string,
  authToken: string,
  request: CompatChatRequest,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<CompatChatResponse> {
  const log = createSubsystemLogger("runtime.brain-chat");

  if (!brainUrl) {
    throw new Error("brainUrl not configured");
  }
  if (!authToken) {
    throw new Error("authToken not configured");
  }
  const runtimeHost = await createMirrorRuntimeHost(
    {
      providerUrl: brainUrl,
      providerAuthToken: authToken,
    },
    { fetchImpl: deps.fetchImpl },
  );

  try {
    return await withMirrorCompatLogLevel(async () => {
      const prepared = await prepareCompatBrainChatRequest(request);
      const adapterResponse = await runtimeHost.executeAdapterRequest(
        buildCompatBrainChatEnvelope({
          request,
          traceId: prepared.requestId,
          routePath: "/api/brain/chat",
          method: "POST",
        }),
        {
          provider: {
            url: brainUrl,
            authToken,
          },
          fetchImpl: deps.fetchImpl,
        },
      );
      if (adapterResponse.kind !== "chat.response") {
        throw new Error(`Unexpected Mirror adapter response kind: ${adapterResponse.kind}`);
      }

      log.info(
        `brain chat: ${prepared.requestId} ${adapterResponse.response.usage?.total_tokens || 0} tokens`,
      );
      if (prepared.diagnostics) {
        log.debug(
          "brain chat retrieval diagnostics",
          typeof prepared.diagnostics === "object" && prepared.diagnostics !== null
            ? (prepared.diagnostics as Record<string, unknown>)
            : { diagnostics: prepared.diagnostics },
        );
      }
      return adapterResponse.response as CompatChatResponse;
    });
  } catch (err) {
    log.error(`brain chat error: ${String(err)}`);
    env.error(String(err));
    throw err;
  } finally {
    await runtimeHost.shutdown();
  }
}
