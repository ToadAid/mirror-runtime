import type { ReplyBackendResult } from "../auto-reply/reply/backend.js";
import type { MirrorDaemonReplyRequest } from "./reply-backend-adapter.js";

export interface MirrorRuntimeClient {
  executeReply(request: MirrorDaemonReplyRequest): Promise<ReplyBackendResult>;
}

export class StubMirrorRuntimeClient implements MirrorRuntimeClient {
  async executeReply(_request: MirrorDaemonReplyRequest): Promise<ReplyBackendResult> {
    return { text: "[mirror-daemon stub reply]" };
  }
}
