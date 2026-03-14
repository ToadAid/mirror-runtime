import type { MirrorPolicyContext, MirrorPolicyEngine } from "../mirror-policy/index.js";
import type { MirrorProviderPlane } from "../mirror-provider/index.js";
import type { MirrorRuntimeCorrelation } from "../mirror-runtime/index.js";
import type { MirrorToolInputSchema } from "../mirror/skills/index.js";

export type MirrorActionAccess = "open" | "operator";
export type MirrorActionSource = "tool_bridge" | "native";

export type MirrorActionDescriptor = {
  action_name: string;
  description: string;
  version: string;
  access: MirrorActionAccess;
  source: MirrorActionSource;
  input_schema: MirrorToolInputSchema;
  execution: {
    provider_usage: "none" | "optional" | "required";
  };
  compatibility?: {
    tool_name?: string;
  };
};

export type MirrorActionExecutionRequest = {
  action_name: string;
  input: Record<string, unknown>;
  context?: MirrorPolicyContext;
  policy?: MirrorPolicyEngine;
  providerPlane?: MirrorProviderPlane;
  correlation?: Partial<MirrorRuntimeCorrelation>;
};

export type MirrorActionExecutionResult = {
  ok: true;
  execution_id: string;
  action_id: string;
  action_name: string;
  trace_id: string;
  session_id?: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  result: Record<string, unknown>;
};

export type MirrorActionFailureResult = {
  ok: false;
  execution_id: string;
  action_id: string;
  action_name: string;
  trace_id: string;
  session_id?: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error: string;
};

export type MirrorActionLifecycleEvent =
  | {
      type: "started";
      execution_id: string;
      action_id: string;
      trace_id: string;
      session_id?: string;
      action: MirrorActionDescriptor;
      input: Record<string, unknown>;
      context?: MirrorPolicyContext;
      timestamp: string;
    }
  | {
      type: "finished";
      execution_id: string;
      action_id: string;
      trace_id: string;
      session_id?: string;
      action: MirrorActionDescriptor;
      context?: MirrorPolicyContext;
      timestamp: string;
      result: MirrorActionExecutionResult;
    }
  | {
      type: "failed";
      execution_id: string;
      action_id: string;
      trace_id: string;
      session_id?: string;
      action: MirrorActionDescriptor;
      context?: MirrorPolicyContext;
      timestamp: string;
      result: MirrorActionFailureResult;
    };

export type MirrorActionHandler = (
  input: Record<string, unknown>,
  context: {
    action: MirrorActionDescriptor;
    policyContext?: MirrorPolicyContext;
    providerPlane?: MirrorProviderPlane;
  },
) => Promise<Record<string, unknown>>;

export type MirrorAction = {
  descriptor: MirrorActionDescriptor;
  execute: MirrorActionHandler;
};

export type MirrorActionRuntime = {
  registerAction: (action: MirrorAction) => void;
  getAction: (name: string) => MirrorAction | undefined;
  listActions: () => MirrorAction[];
  executeAction: (
    request: MirrorActionExecutionRequest,
    options?: {
      onLifecycleEvent?: (event: MirrorActionLifecycleEvent) => void;
    },
  ) => Promise<MirrorActionExecutionResult>;
};
