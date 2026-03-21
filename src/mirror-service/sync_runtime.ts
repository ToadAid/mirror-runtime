import crypto from "node:crypto";
import type { MirrorGateway } from "../mirror-gateway/index.js";
import { buildMirrorActionPolicyTarget } from "../mirror-policy/index.js";
import { resolveMirrorTraceId, withMirrorCorrelation } from "../mirror-runtime/index.js";
import {
  executeMirrorSyncAction,
  type MirrorSyncActionName,
  type MirrorSyncManager,
} from "../mirror-sync/index.js";
import type { Mirrordaemon } from "../mirrordaemon/index.js";

type MirrorRuntimeSyncContext = {
  user_id?: string;
};

type ExecuteMirrorRuntimeSyncActionOptions = {
  daemon: Mirrordaemon;
  gateway: MirrorGateway;
  syncManager: MirrorSyncManager;
};

function trackCliSyncSession(
  daemon: Mirrordaemon,
  params: {
    user_id?: string;
    metadata: Record<string, unknown>;
  },
): string {
  const sessionId = crypto.randomUUID();
  daemon.createSession({
    session_id: sessionId,
    user_id: params.user_id,
    metadata: {
      surface: "cli",
      ...params.metadata,
    },
  });
  return sessionId;
}

export async function executeMirrorRuntimeSyncAction(
  options: ExecuteMirrorRuntimeSyncActionOptions,
  action: MirrorSyncActionName,
  input: { peer_id?: string; base_url?: string; requested_paths?: string[] } = {},
  context: MirrorRuntimeSyncContext = {},
): Promise<Record<string, unknown>> {
  const sessionId = trackCliSyncSession(options.daemon, {
    user_id: context.user_id,
    metadata: {
      command: "sync",
      action,
    },
  });
  const traceId = resolveMirrorTraceId(undefined);
  const policyDecision = await options.gateway.policy.evaluate({
    phase: "action",
    target: buildMirrorActionPolicyTarget(`sync.${action}`, input),
    context: {
      surface: "cli",
      command: "sync",
      actor: {
        user_id: context.user_id,
      },
      session: {
        session_id: sessionId,
      },
      metadata: {
        trace_id: traceId,
        action,
      },
    },
  });
  const correlation = {
    trace_id: traceId,
    session_id: sessionId,
  };
  try {
    if (!policyDecision.allowed) {
      options.daemon.publishRuntimeEvent(
        "policy.denied",
        withMirrorCorrelation(
          {
            session_id: sessionId,
            phase: "action",
            target: "action",
            action: `sync.${action}`,
            code: policyDecision.decision.code,
          },
          correlation,
        ),
      );
      throw new Error(policyDecision.decision.reason);
    }
    options.daemon.publishRuntimeEvent(
      "sync.action.started",
      withMirrorCorrelation(
        {
          session_id: sessionId,
          action,
        },
        correlation,
      ),
    );
    return await executeMirrorSyncAction(options.syncManager, action, input);
  } catch (error) {
    options.daemon.publishRuntimeEvent(
      "sync.action.failed",
      withMirrorCorrelation(
        {
          session_id: sessionId,
          action,
          error: String(error),
        },
        correlation,
      ),
    );
    throw error;
  } finally {
    options.daemon.publishRuntimeEvent(
      "sync.action.finished",
      withMirrorCorrelation(
        {
          session_id: sessionId,
          action,
        },
        correlation,
      ),
    );
    options.daemon.touchSession(sessionId, {
      user_id: context.user_id,
      metadata: {
        command: "sync",
        action,
      },
    });
  }
}
