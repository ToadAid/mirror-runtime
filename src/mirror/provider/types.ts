export type MirrorProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type MirrorProviderCompleteInput = {
  prompt: string;
  system?: string;
  messages?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
};

export type MirrorProviderCompleteOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type MirrorProviderCompletion = {
  text: string;
  provider: string;
  model: string;
  usage?: MirrorProviderUsage;
  raw?: unknown;
};

export type MirrorProviderError = {
  code: string;
  message: string;
  retryable?: boolean;
  provider?: string;
};

export type MirrorProvider = {
  name: string;
  complete: (
    input: MirrorProviderCompleteInput,
    options?: MirrorProviderCompleteOptions,
  ) => Promise<MirrorProviderCompletion>;
};

export type MirrorProviderAdapterCompleteResult = {
  text: string;
  model?: string;
  usage?: MirrorProviderUsage;
  raw?: unknown;
};

export type MirrorProviderAdapter = {
  complete: (
    input: MirrorProviderCompleteInput,
    options?: MirrorProviderCompleteOptions,
  ) => Promise<MirrorProviderAdapterCompleteResult>;
};
