export type MirrorTelegramValidationResult =
  | {
      ok: true;
      bot: {
        id: number;
        username: string | null;
        display_name: string | null;
      };
    }
  | {
      ok: false;
      error: string;
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

function toDisplayName(result: TelegramGetMeResult): string | null {
  const parts = [result.first_name, result.last_name].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return result.username ?? null;
}

export async function validateTelegramBotToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorTelegramValidationResult> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: "Telegram bot token is required.",
    };
  }

  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${trimmed}/getMe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const body = (await res.json()) as TelegramApiEnvelope<TelegramGetMeResult>;
    if (!res.ok || !body.ok || !body.result) {
      return {
        ok: false,
        error:
          body.description ||
          body.error_code?.toString() ||
          `Telegram validation failed with ${res.status}`,
      };
    }
    return {
      ok: true,
      bot: {
        id: body.result.id,
        username: body.result.username ?? null,
        display_name: toDisplayName(body.result),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Telegram validation failed",
    };
  }
}
