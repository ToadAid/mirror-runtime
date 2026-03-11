import type { OpenClawConfig } from "../../config/config.js";
import { getReplyFromConfig } from "../reply.js";
import type { MsgContext } from "../templating.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";

export type ReplyBackendResult = ReplyPayload | ReplyPayload[] | undefined;

export type ReplyBackendResolveParams = {
  ctx: MsgContext;
  replyOptions?: GetReplyOptions;
  configOverride?: OpenClawConfig;
};

export type ReplyResolver = (
  ctx: MsgContext,
  opts?: GetReplyOptions,
  configOverride?: OpenClawConfig,
) => Promise<ReplyBackendResult>;

export type ReplyBackend = {
  resolveReply: (params: ReplyBackendResolveParams) => Promise<ReplyBackendResult>;
};

export function createReplyBackendFromResolver(resolver: ReplyResolver): ReplyBackend {
  return {
    resolveReply: async ({ ctx, replyOptions, configOverride }) =>
      await resolver(ctx, replyOptions, configOverride),
  };
}

export const defaultReplyBackend = createReplyBackendFromResolver(getReplyFromConfig);
