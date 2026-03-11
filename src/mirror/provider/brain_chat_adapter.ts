import { createMirrorProvider } from "./index.js";
import type {
  MirrorProvider,
  MirrorProviderCompleteInput,
  MirrorProviderCompleteOptions,
} from "./types.js";

export type MirrorBrainChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type MirrorBrainChatRequest = {
  model: string;
  messages: MirrorBrainChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

export type MirrorBrainChatResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: MirrorBrainChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type MirrorBrainChatTransport = (
  request: MirrorBrainChatRequest,
) => Promise<MirrorBrainChatResponse>;

export type CreateMirrorBrainChatProviderOptions = {
  name?: string;
  defaultModel: string;
  transport: MirrorBrainChatTransport;
};

function resolveMessages(input: MirrorProviderCompleteInput): MirrorBrainChatMessage[] {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    return input.messages;
  }
  const messages: MirrorBrainChatMessage[] = [];
  if (typeof input.system === "string" && input.system.trim().length > 0) {
    messages.push({ role: "system", content: input.system });
  }
  messages.push({ role: "user", content: input.prompt });
  return messages;
}

function resolveModel(defaultModel: string, options?: MirrorProviderCompleteOptions): string {
  if (typeof options?.model === "string" && options.model.trim().length > 0) {
    return options.model;
  }
  return defaultModel;
}

export function createMirrorBrainChatProvider(
  params: CreateMirrorBrainChatProviderOptions,
): MirrorProvider {
  return createMirrorProvider({
    name: params.name ?? "mirror.brain-chat",
    defaultModel: params.defaultModel,
    adapter: {
      complete: async (input, options) => {
        const model = resolveModel(params.defaultModel, options);
        const response = await params.transport({
          model,
          messages: resolveMessages(input),
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stream: false,
        });
        const text = response.choices[0]?.message?.content ?? "";
        return {
          text,
          model: response.model || model,
          usage: response.usage
            ? {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined,
          raw: response,
        };
      },
    },
  });
}
