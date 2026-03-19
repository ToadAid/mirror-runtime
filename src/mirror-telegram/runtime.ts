import { setTimeout as sleep } from "node:timers/promises";
import type { FetchLike } from "../mirror-provider/index.js";
import type { MirrorResolvedSettings } from "../mirror-settings/index.js";
import type {
  MirrordaemonConnectorRuntimeState,
  MirrordaemonConnectorRuntimeStatus,
} from "../mirrordaemon/index.js";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: {
    id: number;
    type: string;
  };
  from?: TelegramUser;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramGetMeResult = {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramApiEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

export type MirrorTelegramMessageEnvelope = {
  update_id: number;
  chat_id: number;
  message_id: number;
  text: string;
  chat_type: string;
  from: {
    id: number;
    username?: string;
    display_name?: string;
  } | null;
};

export type MirrorTelegramRuntime = {
  getStatus: () => MirrordaemonConnectorRuntimeStatus;
  shutdown: () => Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function buildStatus(
  state: MirrordaemonConnectorRuntimeState,
  params: Partial<MirrordaemonConnectorRuntimeStatus> = {},
): MirrordaemonConnectorRuntimeStatus {
  return {
    state,
    enabled: params.enabled ?? false,
    configured: params.configured ?? false,
    running: params.running ?? false,
    updated_at: params.updated_at ?? nowIso(),
    last_error: params.last_error ?? null,
    last_error_at: params.last_error_at ?? null,
    last_error_summary: params.last_error_summary ?? params.last_error ?? null,
    last_successful_poll_at: params.last_successful_poll_at ?? null,
    updates_processed: params.updates_processed ?? 0,
    bot: params.bot ?? null,
    detail: params.detail ?? null,
  };
}

function isTokenInvalidError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("invalid token") ||
    normalized.includes("bot token")
  );
}

function toDisplayName(user: TelegramUser | undefined): string | undefined {
  if (!user) {
    return undefined;
  }
  const parts = [user.first_name, user.last_name].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : user.username;
}

function toBotDisplayName(bot: TelegramGetMeResult): string | undefined {
  const parts = [bot.first_name, bot.last_name].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : bot.username;
}

async function readTelegramApi<T>(
  token: string,
  method: string,
  body: Record<string, unknown> | undefined,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  const payload = (await res.json()) as TelegramApiEnvelope<T>;
  if (!res.ok || !payload.ok || payload.result === undefined) {
    throw new Error(
      payload.description ||
        payload.error_code?.toString() ||
        `Telegram ${method} failed with ${res.status}`,
    );
  }
  return payload.result;
}

function resolveTelegramConfig(settings: MirrorResolvedSettings): {
  mode: MirrorResolvedSettings["connectors"]["mode"];
  enabled: boolean;
  setupState: string;
  token: string;
} {
  const entry = settings.connectors.connectors.telegram ?? {
    enabled: false,
    setup_state: "unconfigured",
    credential_id: "telegram:default",
  };
  const credentialId = entry.credential_id ?? "telegram:default";
  const token = settings.credentials.credentials[credentialId]?.value?.trim() ?? "";
  return {
    mode: settings.connectors.mode,
    enabled: entry.enabled === true,
    setupState: entry.setup_state ?? "unconfigured",
    token,
  };
}

export async function createMirrorTelegramRuntime(params: {
  settings: MirrorResolvedSettings;
  fetchImpl?: FetchLike;
  onMessage: (message: MirrorTelegramMessageEnvelope) => Promise<string | null>;
  onStatusChange?: (status: MirrordaemonConnectorRuntimeStatus) => void;
  onRuntimeEvent?: (type: string, payload?: Record<string, unknown>) => void;
  pollTimeoutSeconds?: number;
  retryDelayMs?: number;
}): Promise<MirrorTelegramRuntime> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const { mode, enabled, setupState, token } = resolveTelegramConfig(params.settings);
  const shouldRun = mode === "connectors" && enabled;
  const configured = token.length > 0;
  const pollTimeoutSeconds = params.pollTimeoutSeconds ?? 1;
  const retryDelayMs = params.retryDelayMs ?? 250;
  const controller = new AbortController();
  let nextOffset: number | undefined;
  let loopPromise: Promise<void> | null = null;
  let status = buildStatus(
    !shouldRun
      ? "disabled"
      : configured
        ? "ready"
        : setupState === "unconfigured"
          ? "unconfigured"
          : "token_missing",
    {
      enabled: shouldRun,
      configured,
    },
  );

  const setStatus = (next: MirrordaemonConnectorRuntimeStatus) => {
    status = {
      ...status,
      ...next,
      updated_at: nowIso(),
    };
    params.onStatusChange?.(status);
    params.onRuntimeEvent?.("connector.telegram.status", {
      state: status.state,
      enabled: status.enabled,
      configured: status.configured,
      running: status.running,
      detail: status.detail,
      last_error: status.last_error,
      last_error_at: status.last_error_at,
      last_error_summary: status.last_error_summary,
      last_successful_poll_at: status.last_successful_poll_at,
      updates_processed: status.updates_processed,
      bot_username: status.bot?.username,
      bot_id: status.bot?.id,
    });
  };

  const updateStatus = (
    state: MirrordaemonConnectorRuntimeState,
    next: Partial<MirrordaemonConnectorRuntimeStatus> = {},
  ) => {
    setStatus(
      buildStatus(state, {
        ...status,
        ...next,
      }),
    );
  };

  async function sendReply(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    await readTelegramApi(
      token,
      "sendMessage",
      {
        chat_id: chatId,
        text,
        ...(typeof replyToMessageId === "number" ? { reply_to_message_id: replyToMessageId } : {}),
      },
      fetchImpl,
      controller.signal,
    );
  }

  async function handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    const text = message?.text?.trim() || message?.caption?.trim() || "";
    if (!message || text.length === 0) {
      return;
    }
    const envelope: MirrorTelegramMessageEnvelope = {
      update_id: update.update_id,
      chat_id: message.chat.id,
      message_id: message.message_id,
      text,
      chat_type: message.chat.type,
      from: message.from
        ? {
            id: message.from.id,
            username: message.from.username,
            display_name: toDisplayName(message.from),
          }
        : null,
    };
    params.onRuntimeEvent?.("telegram.message.received", {
      chat_id: envelope.chat_id,
      message_id: envelope.message_id,
      update_id: envelope.update_id,
      chat_type: envelope.chat_type,
      from_id: envelope.from?.id,
    });
    const reply = await params.onMessage(envelope);
    if (!reply || reply.trim().length === 0) {
      return;
    }
    await sendReply(envelope.chat_id, reply.trim(), envelope.message_id);
    params.onRuntimeEvent?.("telegram.message.replied", {
      chat_id: envelope.chat_id,
      message_id: envelope.message_id,
      update_id: envelope.update_id,
    });
  }

  async function pollLoop(): Promise<void> {
    updateStatus("running", {
      enabled: true,
      configured: true,
      running: true,
      detail: status.detail,
    });
    while (!controller.signal.aborted) {
      try {
        const updates = await readTelegramApi<TelegramUpdate[]>(
          token,
          "getUpdates",
          {
            timeout: pollTimeoutSeconds,
            ...(typeof nextOffset === "number" ? { offset: nextOffset } : {}),
          },
          fetchImpl,
          controller.signal,
        );
        updateStatus("running", {
          enabled: true,
          configured: true,
          running: true,
          detail: status.detail,
          last_successful_poll_at: nowIso(),
          updates_processed: status.updates_processed + updates.length,
        });
        if (updates.length === 0) {
          await sleep(retryDelayMs, undefined, {
            signal: controller.signal,
          }).catch(() => undefined);
          continue;
        }
        for (const update of updates) {
          nextOffset = update.update_id + 1;
          try {
            await handleUpdate(update);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Telegram message handling failed";
            updateStatus("error", {
              enabled: true,
              configured: true,
              running: false,
              detail: status.detail,
              last_error: message,
              last_error_at: nowIso(),
              last_error_summary: message,
            });
            params.onRuntimeEvent?.("telegram.message.failed", {
              update_id: update.update_id,
              error: message,
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Telegram polling failed";
        if (isTokenInvalidError(message)) {
          updateStatus("token_invalid", {
            enabled: true,
            configured: true,
            running: false,
            last_error: message,
            last_error_at: nowIso(),
            last_error_summary: message,
          });
          return;
        }
        updateStatus("error", {
          enabled: true,
          configured: true,
          running: false,
          detail: status.detail,
          last_error: message,
          last_error_at: nowIso(),
          last_error_summary: message,
        });
        await sleep(retryDelayMs, undefined, { signal: controller.signal }).catch(() => undefined);
      }
    }
  }

  if (!shouldRun || !configured) {
    setStatus(status);
    return {
      getStatus: () => status,
      shutdown: async () => {},
    };
  }

  try {
    const bot = await readTelegramApi<TelegramGetMeResult>(
      token,
      "getMe",
      undefined,
      fetchImpl,
      controller.signal,
    );
    const botDisplayName = toBotDisplayName(bot);
    updateStatus("ready", {
      enabled: true,
      configured: true,
      running: false,
      detail: bot.username ? `@${bot.username}` : (botDisplayName ?? "telegram bot"),
      bot: {
        id: bot.id,
        username: bot.username ?? null,
        display_name: botDisplayName ?? null,
      },
      last_error: null,
      last_error_at: null,
      last_error_summary: null,
    });
    loopPromise = pollLoop();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram token validation failed";
    updateStatus(isTokenInvalidError(message) ? "token_invalid" : "error", {
      enabled: true,
      configured: true,
      running: false,
      last_error: message,
      last_error_at: nowIso(),
      last_error_summary: message,
    });
  }

  return {
    getStatus: () => status,
    async shutdown() {
      controller.abort();
      await loopPromise?.catch(() => undefined);
    },
  };
}
