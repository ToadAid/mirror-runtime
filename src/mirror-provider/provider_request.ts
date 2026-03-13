import type { MirrorModelRequest } from "../mirror-runtime/mirror_response.js";

export type MirrorProviderConfig = {
  url: string;
  authToken: string;
  timeoutMs?: number;
};

export type MirrorProviderRequest = MirrorModelRequest;
