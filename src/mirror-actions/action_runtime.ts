import crypto from "node:crypto";
import {
  buildMirrorActionPolicyTarget,
  ensureMirrorPolicyAllowed,
} from "../mirror-policy/index.js";
import {
  buildMirrorCorrelationFromPolicyContext,
  resolveMirrorTraceId,
} from "../mirror-runtime/index.js";
import type { MirrorAction, MirrorActionRuntime } from "./action_types.js";

export function createMirrorActionRuntime(actions: MirrorAction[] = []): MirrorActionRuntime {
  const actionMap = new Map<string, MirrorAction>();

  for (const action of actions) {
    if (actionMap.has(action.descriptor.action_name)) {
      throw new Error(`Mirror action already registered: ${action.descriptor.action_name}`);
    }
    actionMap.set(action.descriptor.action_name, action);
  }

  return {
    registerAction(action) {
      if (actionMap.has(action.descriptor.action_name)) {
        throw new Error(`Mirror action already registered: ${action.descriptor.action_name}`);
      }
      actionMap.set(action.descriptor.action_name, action);
    },
    getAction(name) {
      return actionMap.get(name);
    },
    listActions() {
      return [...actionMap.values()];
    },
    async executeAction(request, options = {}) {
      const action = actionMap.get(request.action_name);
      if (!action) {
        throw new Error(`Unknown Mirror action: ${request.action_name}`);
      }

      if (request.policy && request.context) {
        const evaluation = await request.policy.evaluate({
          phase: "action",
          target: buildMirrorActionPolicyTarget(request.action_name, request.input, {
            access: action.descriptor.access,
            source: action.descriptor.source,
          }),
          context: request.context,
        });
        ensureMirrorPolicyAllowed(evaluation);
      }

      const execution_id = crypto.randomUUID();
      const action_id = execution_id;
      const baseCorrelation =
        request.correlation ?? buildMirrorCorrelationFromPolicyContext(request.context);
      const trace_id = resolveMirrorTraceId(baseCorrelation?.trace_id);
      const session_id = baseCorrelation?.session_id;
      const started_at = new Date().toISOString();
      options.onLifecycleEvent?.({
        type: "started",
        execution_id,
        action_id,
        trace_id,
        session_id,
        action: action.descriptor,
        input: request.input,
        context: request.context,
        timestamp: started_at,
      });

      const startedMs = Date.now();
      try {
        const resultPayload = await action.execute(request.input, {
          action: action.descriptor,
          policyContext: request.context,
          providerPlane: request.providerPlane,
        });
        const finished_at = new Date().toISOString();
        const result = {
          ok: true as const,
          execution_id,
          action_id,
          action_name: action.descriptor.action_name,
          trace_id,
          session_id,
          started_at,
          finished_at,
          duration_ms: Date.now() - startedMs,
          result: resultPayload,
        };
        options.onLifecycleEvent?.({
          type: "finished",
          execution_id,
          action_id,
          trace_id,
          session_id,
          action: action.descriptor,
          context: request.context,
          timestamp: finished_at,
          result,
        });
        return result;
      } catch (error) {
        const finished_at = new Date().toISOString();
        const result = {
          ok: false as const,
          execution_id,
          action_id,
          action_name: action.descriptor.action_name,
          trace_id,
          session_id,
          started_at,
          finished_at,
          duration_ms: Date.now() - startedMs,
          error: String(error),
        };
        options.onLifecycleEvent?.({
          type: "failed",
          execution_id,
          action_id,
          trace_id,
          session_id,
          action: action.descriptor,
          context: request.context,
          timestamp: finished_at,
          result,
        });
        throw error;
      }
    },
  };
}
