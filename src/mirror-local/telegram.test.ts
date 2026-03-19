import { describe, expect, it, vi } from "vitest";
import { validateTelegramBotToken } from "./telegram.js";

describe("mirror telegram validation", () => {
  it("returns bot identity on successful getMe", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            id: 99,
            is_bot: true,
            username: "mirror_bot",
            first_name: "Mirror",
            last_name: "Bot",
          },
        }),
      } as Response;
    });

    await expect(
      validateTelegramBotToken("telegram-token", fetchImpl as typeof fetch),
    ).resolves.toEqual({
      ok: true,
      bot: {
        id: 99,
        username: "mirror_bot",
        display_name: "Mirror Bot",
      },
    });
  });

  it("returns a clear error when Telegram rejects the token", async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: false,
        json: async () => ({
          ok: false,
          description: "Unauthorized",
        }),
      } as Response;
    });

    await expect(
      validateTelegramBotToken("telegram-token", fetchImpl as typeof fetch),
    ).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });
});
