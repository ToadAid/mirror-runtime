import crypto from "node:crypto";
import type {
  MirrorAdapterRequestEnvelope,
  MirrorAdapterResponseEnvelope,
} from "../mirror-adapters/index.js";
import type { MirrorGateway } from "../mirror-gateway/index.js";
import type {
  FetchLike,
  MirrorProviderConfig,
  MirrorProviderPlane,
} from "../mirror-provider/index.js";
import { withMirrorCorrelation } from "../mirror-runtime/index.js";
import type { Mirrordaemon } from "../mirrordaemon/index.js";

type ExecuteMirrorRuntimeAdapterRequestOptions = {
  daemon: Mirrordaemon;
  gateway: MirrorGateway;
  providerPlane: MirrorProviderPlane;
  fetchImpl?: FetchLike;
};

type ExecuteMirrorRuntimeAdapterRequestDeps = {
  fetchImpl?: FetchLike;
  provider?: MirrorProviderConfig;
};

function getSessionMetadata(
  envelope: MirrorAdapterRequestEnvelope,
): Record<string, unknown> | undefined {
  return envelope.context.session?.metadata &&
    typeof envelope.context.session.metadata === "object" &&
    !Array.isArray(envelope.context.session.metadata)
    ? envelope.context.session.metadata
    : undefined;
}

export async function executeMirrorRuntimeAdapterRequest(
  options: ExecuteMirrorRuntimeAdapterRequestOptions,
  envelope: MirrorAdapterRequestEnvelope,
  runtimeDeps: ExecuteMirrorRuntimeAdapterRequestDeps = {},
): Promise<MirrorAdapterResponseEnvelope> {
  const sessionId =
    envelope.context.session?.session_id ?? envelope.context.session?.external_session_id;
  const userId = envelope.context.actor?.user_id ?? envelope.context.actor?.external_user_id;
  const traceId =
    envelope.context.runtime?.trace_id ??
    envelope.context.runtime?.correlation_id ??
    envelope.envelope_id;
  const correlation = {
    trace_id: traceId,
    session_id: sessionId,
    action_id: envelope.context.action?.tool_call_id,
  };
  const isCliIngress = envelope.context.adapter.adapter_id === "mirror-cli";
  const sessionMetadata = getSessionMetadata(envelope);

  if (sessionId) {
    const existing = options.daemon.getSession(sessionId);
    if (existing) {
      options.daemon.touchSession(sessionId, {
        user_id: userId,
        metadata: {
          surface: envelope.context.adapter.adapter_id,
          ...sessionMetadata,
        },
      });
    } else {
      options.daemon.createSession({
        session_id: sessionId,
        user_id: userId,
        metadata: {
          surface: envelope.context.adapter.adapter_id,
          ...sessionMetadata,
        },
      });
    }
  }

  const actionId = envelope.context.action?.tool_call_id ?? crypto.randomUUID();
  const executionId = crypto.randomUUID();

  try {
    if (isCliIngress && envelope.kind === "chat.request") {
      options.daemon.publishRuntimeEvent(
        "chat.started",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            model: envelope.request.model,
          },
          correlation,
        ),
      );
    }
    if (isCliIngress && envelope.kind === "tool.request") {
      options.daemon.publishRuntimeEvent(
        "tool.execution.started",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            tool: envelope.request.tool_name,
          },
          {
            ...correlation,
            action_id: actionId,
          },
        ),
      );
      options.daemon.publishRuntimeEvent(
        "action.execution.started",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            action: envelope.request.tool_name,
            execution_id: executionId,
          },
          {
            ...correlation,
            action_id: actionId,
          },
        ),
      );
    }

    const response = await options.gateway.executeAdapterRequest(envelope, {
      provider: runtimeDeps.provider,
      providerPlane: runtimeDeps.provider ? undefined : options.providerPlane,
      fetchImpl: runtimeDeps.fetchImpl ?? options.fetchImpl,
      onRuntimeEvent: options.daemon.publishRuntimeEvent,
      correlation,
    });

    if (isCliIngress && envelope.kind === "chat.request") {
      options.daemon.publishRuntimeEvent(
        "chat.finished",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            model: response.kind === "chat.response" ? response.response.model : undefined,
          },
          correlation,
        ),
      );
    }
    if (isCliIngress && envelope.kind === "tool.request") {
      options.daemon.publishRuntimeEvent(
        "tool.execution.finished",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            tool: envelope.request.tool_name,
          },
          {
            ...correlation,
            action_id: actionId,
          },
        ),
      );
      options.daemon.publishRuntimeEvent(
        "action.execution.finished",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            action: envelope.request.tool_name,
            execution_id: executionId,
          },
          {
            ...correlation,
            action_id: actionId,
          },
        ),
      );
    }
    if (sessionId) {
      options.daemon.touchSession(sessionId, {
        user_id: userId,
        metadata: {
          surface: envelope.context.adapter.adapter_id,
          ...sessionMetadata,
        },
      });
    }
    return response;
  } catch (error) {
    if (isCliIngress && envelope.kind === "chat.request") {
      options.daemon.publishRuntimeEvent(
        "chat.failed",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            model: envelope.request.model,
            error: String(error),
          },
          correlation,
        ),
      );
    }
    if (isCliIngress && envelope.kind === "tool.request") {
      options.daemon.publishRuntimeEvent(
        "tool.execution.failed",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            tool: envelope.request.tool_name,
            error: String(error),
          },
          {
            ...correlation,
            action_id: actionId,
          },
        ),
      );
      options.daemon.publishRuntimeEvent(
        "action.execution.failed",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            action: envelope.request.tool_name,
            execution_id: executionId,
            error: String(error),
          },
          {
            ...correlation,
            action_id: actionId,
          },
        ),
      );
    }
    throw error;
  }
}
