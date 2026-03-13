import type { MirrorChatMessage } from "./mirror_request.js";

export type MirrorChatResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: MirrorChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type MirrorModelRequest = {
  model: string;
  messages: MirrorChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
};

export type MirrorChatDiagnostics = {
  loreDir: string;
  indexState: string;
  totalIndexed: number;
  returnedCandidates: number;
};

export type MirrorPreparedChatRequest = {
  modelRequest: MirrorModelRequest;
  diagnostics?: MirrorChatDiagnostics;
};
