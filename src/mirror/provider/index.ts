import type {
  MirrorProvider,
  MirrorProviderAdapter,
  MirrorProviderCompleteInput,
  MirrorProviderCompleteOptions,
  MirrorProviderCompletion,
  MirrorProviderError,
} from "./types.js";

export type MirrorProviderInit = {
  name: string;
  defaultModel: string;
  adapter: MirrorProviderAdapter;
};

export class MirrorProviderException extends Error {
  readonly code: string;
  readonly retryable: boolean | undefined;
  readonly provider: string;

  constructor(params: {
    code: string;
    message: string;
    provider: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message, params.cause !== undefined ? { cause: params.cause } : undefined);
    this.code = params.code;
    this.retryable = params.retryable;
    this.provider = params.provider;
  }

  toJSON(): MirrorProviderError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      provider: this.provider,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeMirrorProviderError(
  error: unknown,
  provider: string,
): MirrorProviderError {
  if (error instanceof MirrorProviderException) {
    return error.toJSON();
  }
  if (error instanceof Error) {
    const maybe = error as Error & { code?: unknown; retryable?: unknown };
    return {
      code:
        typeof maybe.code === "string" && maybe.code.trim().length > 0 ? maybe.code : "E_PROVIDER",
      message: error.message || "provider request failed",
      retryable: typeof maybe.retryable === "boolean" ? maybe.retryable : undefined,
      provider,
    };
  }
  if (isRecord(error)) {
    return {
      code:
        typeof error.code === "string" && error.code.trim().length > 0 ? error.code : "E_PROVIDER",
      message:
        typeof error.message === "string" && error.message.trim().length > 0
          ? error.message
          : "provider request failed",
      retryable: typeof error.retryable === "boolean" ? error.retryable : undefined,
      provider,
    };
  }
  return {
    code: "E_PROVIDER",
    message:
      typeof error === "string" && error.trim().length > 0 ? error : "provider request failed",
    provider,
  };
}

function resolveModel(
  defaultModel: string,
  options: MirrorProviderCompleteOptions | undefined,
  resultModel: string | undefined,
): string {
  if (typeof resultModel === "string" && resultModel.trim().length > 0) {
    return resultModel;
  }
  if (typeof options?.model === "string" && options.model.trim().length > 0) {
    return options.model;
  }
  return defaultModel;
}

export function createMirrorProvider(init: MirrorProviderInit): MirrorProvider {
  return {
    name: init.name,
    complete: async (
      input: MirrorProviderCompleteInput,
      options?: MirrorProviderCompleteOptions,
    ): Promise<MirrorProviderCompletion> => {
      try {
        const result = await init.adapter.complete(input, options);
        if (typeof result.text !== "string") {
          throw new MirrorProviderException({
            code: "E_PROVIDER_INVALID_RESPONSE",
            message: "provider returned non-string completion text",
            provider: init.name,
          });
        }
        return {
          text: result.text,
          provider: init.name,
          model: resolveModel(init.defaultModel, options, result.model),
          usage: result.usage,
          raw: result.raw,
        };
      } catch (error) {
        if (error instanceof MirrorProviderException) {
          throw error;
        }
        const normalized = normalizeMirrorProviderError(error, init.name);
        throw new MirrorProviderException({
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          provider: init.name,
          cause: error,
        });
      }
    },
  };
}

export async function runMirrorProviderCompletion(
  provider: MirrorProvider,
  input: MirrorProviderCompleteInput,
  options?: MirrorProviderCompleteOptions,
): Promise<MirrorProviderCompletion> {
  return await provider.complete(input, options);
}

export type * from "./types.js";
export * from "./brain_chat_adapter.js";
export * from "./config.js";
export * from "./credentials.js";
