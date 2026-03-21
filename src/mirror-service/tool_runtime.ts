import type { MirrorActionLifecycleEvent } from "../mirror-actions/index.js";
import type { MirrorGateway } from "../mirror-gateway/index.js";
import type { MirrorPolicyContext } from "../mirror-policy/index.js";
import type { MirrorProviderPlane } from "../mirror-provider/index.js";
import { resolveMirrorTraceId, withMirrorCorrelation } from "../mirror-runtime/index.js";
import type { Mirrordaemon } from "../mirrordaemon/index.js";

type ExecuteMirrorRuntimeToolContext = {
  user_id?: string;
  command?: string;
  action?: string;
  operator_token?: string | null;
};

type ExecuteMirrorRuntimeToolOptions = {
  daemon: Mirrordaemon;
  gateway: MirrorGateway;
  providerPlane: MirrorProviderPlane;
  toolName: string;
  input: Record<string, unknown>;
  context?: ExecuteMirrorRuntimeToolContext;
  trackCliSession: (
    daemon: Mirrordaemon,
    params: {
      user_id?: string;
      metadata: Record<string, unknown>;
    },
  ) => string;
};

export async function executeMirrorRuntimeTool(
  options: ExecuteMirrorRuntimeToolOptions,
): Promise<Record<string, unknown>> {
  const context = options.context ?? {};
  const sessionId = options.trackCliSession(options.daemon, {
    user_id: context.user_id,
    metadata: {
      command: context.command ?? "tool",
      action: context.action,
      tool: options.toolName,
    },
  });
  const policyContext: MirrorPolicyContext = {
    surface: "cli",
    command: context.command ?? "tool",
    request_token: context.operator_token ?? null,
    actor: {
      user_id: context.user_id,
    },
    session: {
      session_id: sessionId,
    },
    metadata: {
      trace_id: resolveMirrorTraceId(undefined),
      action: context.action,
      tool: options.toolName,
    },
  };
  const correlation = {
    trace_id: String(policyContext.metadata?.trace_id),
    session_id: sessionId,
  };
  try {
    const action = options.gateway.actionRuntime.getAction(options.toolName);
    if (!action) {
      throw new Error(`Unknown Mirror tool: ${options.toolName}`);
    }
    const result = await options.gateway.actionRuntime.executeAction(
      {
        action_name: options.toolName,
        input: options.input,
        context: policyContext,
        policy: options.gateway.policy,
        providerPlane: options.providerPlane,
        correlation,
      },
      {
        onLifecycleEvent(event: MirrorActionLifecycleEvent) {
          if (event.type === "started") {
            options.daemon.publishRuntimeEvent(
              "tool.execution.started",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  tool: event.action.action_name,
                },
                {
                  trace_id: event.trace_id,
                  session_id: event.session_id,
                  action_id: event.action_id,
                },
              ),
            );
            options.daemon.publishRuntimeEvent(
              "action.execution.started",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  action: event.action.action_name,
                  execution_id: event.execution_id,
                },
                {
                  trace_id: event.trace_id,
                  session_id: event.session_id,
                  action_id: event.action_id,
                },
              ),
            );
            return;
          }
          if (event.type === "finished") {
            options.daemon.publishRuntimeEvent(
              "tool.execution.finished",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  tool: event.action.action_name,
                },
                {
                  trace_id: event.trace_id,
                  session_id: event.session_id,
                  action_id: event.action_id,
                },
              ),
            );
            options.daemon.publishRuntimeEvent(
              "action.execution.finished",
              withMirrorCorrelation(
                {
                  session_id: sessionId,
                  action: event.action.action_name,
                  execution_id: event.execution_id,
                },
                {
                  trace_id: event.trace_id,
                  session_id: event.session_id,
                  action_id: event.action_id,
                },
              ),
            );
            return;
          }
          options.daemon.publishRuntimeEvent(
            "tool.execution.failed",
            withMirrorCorrelation(
              {
                session_id: sessionId,
                tool: event.action.action_name,
                error: event.result.error,
              },
              {
                trace_id: event.trace_id,
                session_id: event.session_id,
                action_id: event.action_id,
              },
            ),
          );
          options.daemon.publishRuntimeEvent(
            "action.execution.failed",
            withMirrorCorrelation(
              {
                session_id: sessionId,
                action: event.action.action_name,
                execution_id: event.execution_id,
                error: event.result.error,
              },
              {
                trace_id: event.trace_id,
                session_id: event.session_id,
                action_id: event.action_id,
              },
            ),
          );
        },
      },
    );
    const reviewStatus =
      result.result.review && typeof result.result.review === "object"
        ? (result.result.review as { status?: unknown }).status
        : undefined;
    if (typeof reviewStatus === "string") {
      options.daemon.publishRuntimeEvent(
        "review.decision",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            tool: options.toolName,
            status: reviewStatus,
          },
          {
            trace_id: result.trace_id,
            session_id: result.session_id,
            action_id: result.action_id,
          },
        ),
      );
    }
    return result.result;
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    if (code) {
      options.daemon.publishRuntimeEvent(
        "policy.denied",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            phase: "action",
            target: "action",
            action: options.toolName,
            code,
          },
          correlation,
        ),
      );
    }
    options.daemon.publishRuntimeEvent(
      "tool.execution.failed",
      withMirrorCorrelation(
        {
          session_id: sessionId,
          tool: options.toolName,
          error: String(error),
        },
        correlation,
      ),
    );
    throw error;
  } finally {
    options.daemon.touchSession(sessionId, {
      user_id: context.user_id,
      metadata: {
        command: context.command ?? "tool",
        action: context.action,
        tool: options.toolName,
      },
    });
  }
}
