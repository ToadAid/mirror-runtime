import { defaultReplyBackend, type ReplyBackend } from "../auto-reply/reply/backend.js";
import type { FinalizedMsgContext } from "../auto-reply/templating.js";
import type { MirrorDaemonReplyRouteMeta } from "./reply-backend-adapter.js";
import { MirrorDaemonReplyBackend, type MirrorDaemonReplyBackendOptions } from "./reply-backend.js";
import {
  HttpMirrorRuntimeClient,
  type HttpMirrorRuntimeClientOptions,
} from "./runtime-http-client.js";
import { MIRROR_EXECUTE_ENDPOINT } from "./runtime-http-contract.js";

export type MirrorRuntimeBackendSelectionOptions = {
  env?: NodeJS.ProcessEnv;
  routeMeta:
    | MirrorDaemonReplyRouteMeta
    | ((ctx: FinalizedMsgContext) => MirrorDaemonReplyRouteMeta);
  runtimeClientOptions?: Omit<HttpMirrorRuntimeClientOptions, "endpointPath">;
  replyBackendOptions?: Omit<
    MirrorDaemonReplyBackendOptions,
    "routeMeta" | "env" | "runtimeClient"
  >;
};

export function isMirrorRuntimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MIRROR_RUNTIME_ENABLED === "1";
}

export function inferMirrorDaemonReplyRouteMeta(
  ctx: Pick<FinalizedMsgContext, "SessionKey" | "AccountId" | "Surface" | "Provider">,
): MirrorDaemonReplyRouteMeta {
  const sessionKey = ctx.SessionKey?.trim() ?? "";
  const agentIdMatch = sessionKey.match(/^agent:([^:]+):/);
  if (!agentIdMatch?.[1]) {
    throw new Error("Mirror runtime backend requires an agent-scoped SessionKey");
  }
  return {
    agentId: agentIdMatch[1],
    accountId: ctx.AccountId,
    surface: ctx.Surface ?? ctx.Provider,
  };
}

export function createConfiguredReplyBackend(
  options: MirrorRuntimeBackendSelectionOptions,
): ReplyBackend {
  const env = options.env ?? process.env;
  if (!isMirrorRuntimeEnabled(env)) {
    return defaultReplyBackend;
  }

  return new MirrorDaemonReplyBackend({
    ...options.replyBackendOptions,
    routeMeta: options.routeMeta,
    env,
    runtimeClient: new HttpMirrorRuntimeClient({
      ...options.runtimeClientOptions,
      endpointPath: MIRROR_EXECUTE_ENDPOINT,
    }),
  });
}
