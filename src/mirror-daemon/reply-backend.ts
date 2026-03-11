import type { ReplyBackend, ReplyBackendResult } from "../auto-reply/reply/backend.js";
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.js";
import type { FinalizedMsgContext } from "../auto-reply/templating.js";
import {
  projectMirrorDaemonReplyRequest,
  type MirrorDaemonReplyRequest,
  type MirrorDaemonReplyRouteMeta,
} from "./reply-backend-adapter.js";
import { StubMirrorRuntimeClient, type MirrorRuntimeClient } from "./runtime-client.js";

export type MirrorDaemonReplyBackendOptions = {
  routeMeta:
    | MirrorDaemonReplyRouteMeta
    | ((ctx: FinalizedMsgContext) => MirrorDaemonReplyRouteMeta);
  env?: NodeJS.ProcessEnv;
  runtimeClient?: MirrorRuntimeClient;
};

export class MirrorDaemonReplyBackend implements ReplyBackend {
  private readonly routeMeta:
    | MirrorDaemonReplyRouteMeta
    | ((ctx: FinalizedMsgContext) => MirrorDaemonReplyRouteMeta);
  private readonly env: NodeJS.ProcessEnv;
  private readonly runtimeClient: MirrorRuntimeClient;
  private lastRequest?: MirrorDaemonReplyRequest;

  constructor(options: MirrorDaemonReplyBackendOptions) {
    this.routeMeta = options.routeMeta;
    this.env = options.env ?? process.env;
    this.runtimeClient = options.runtimeClient ?? new StubMirrorRuntimeClient();
  }

  getLastRequest(): MirrorDaemonReplyRequest | undefined {
    return this.lastRequest;
  }

  getLastProjectedMirrorRequest(): MirrorDaemonReplyRequest | undefined {
    return this.lastRequest;
  }

  private shouldLogProjectedRequest(): boolean {
    return this.env.MIRROR_DAEMON_BACKEND_DEBUG === "1";
  }

  private sanitizeProjectedRequestForDebug(
    request: MirrorDaemonReplyRequest,
  ): MirrorDaemonReplyRequest {
    return {
      ...request,
      rawText: request.rawText ? "[redacted]" : undefined,
      commandText: request.commandText ? "[redacted]" : undefined,
      attachments: request.attachments?.map((attachment) => ({
        ...attachment,
        transcript: attachment.transcript ? "[redacted]" : undefined,
      })),
    };
  }

  async resolveReply(
    params: Parameters<ReplyBackend["resolveReply"]>[0],
  ): Promise<ReplyBackendResult> {
    const finalizedCtx = finalizeInboundContext(params.ctx);
    const routeMeta =
      typeof this.routeMeta === "function" ? this.routeMeta(finalizedCtx) : this.routeMeta;
    this.lastRequest = projectMirrorDaemonReplyRequest(
      finalizedCtx,
      params.replyOptions,
      routeMeta,
    );
    console.debug("[mirror-daemon] backend invoked", {
      agentId: this.lastRequest.agentId,
      sessionKey: this.lastRequest.sessionKey,
      surface: this.lastRequest.surface,
    });
    if (this.shouldLogProjectedRequest()) {
      console.debug(
        "[mirror-daemon] projected request",
        this.sanitizeProjectedRequestForDebug(this.lastRequest),
      );
    }
    return await this.runtimeClient.executeReply(this.lastRequest);
  }
}
