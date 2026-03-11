import type { OpenClawConfig } from "../../config/config.js";
import type { DispatchInboundResult } from "../dispatch.js";
import {
  dispatchInboundMessageWithBufferedDispatcher,
  dispatchInboundMessageWithDispatcher,
} from "../dispatch.js";
import type { FinalizedMsgContext, MsgContext } from "../templating.js";
import type { GetReplyOptions } from "../types.js";
import type { ReplyBackend, ReplyResolver } from "./backend.js";
import type {
  ReplyDispatcherOptions,
  ReplyDispatcherWithTypingOptions,
} from "./reply-dispatcher.js";

export async function dispatchReplyWithBufferedBlockDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyBackend?: ReplyBackend;
  replyResolver?: ReplyResolver;
}): Promise<DispatchInboundResult> {
  return await dispatchInboundMessageWithBufferedDispatcher({
    ctx: params.ctx,
    cfg: params.cfg,
    dispatcherOptions: params.dispatcherOptions,
    replyBackend: params.replyBackend,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
}

export async function dispatchReplyWithDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyBackend?: ReplyBackend;
  replyResolver?: ReplyResolver;
}): Promise<DispatchInboundResult> {
  return await dispatchInboundMessageWithDispatcher({
    ctx: params.ctx,
    cfg: params.cfg,
    dispatcherOptions: params.dispatcherOptions,
    replyBackend: params.replyBackend,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
}
