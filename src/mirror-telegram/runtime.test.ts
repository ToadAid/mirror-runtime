import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMirrorSettingsSync, writeMirrorSettingsFilesSync } from "../mirror-settings/index.js";
import { createMirrorTelegramRuntime } from "./runtime.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempHome(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

function fetchTarget(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function parseJsonBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    return {};
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

function writeTelegramSettings(params: {
  homeRoot: string;
  mode?: "api_only" | "local_ui" | "connectors";
  enabled?: boolean;
  token?: string;
}) {
  writeMirrorSettingsFilesSync({
    mirror: {
      version: 1,
      runtime: {
        port: 7777,
        node_id: "telegram-test",
        base_url: null,
        web_ui_enabled: true,
      },
      workspace: {
        root: path.join(params.homeRoot, ".mirror", "workspace"),
      },
      onboarding: {},
    },
    providers: {
      version: 1,
      default_provider_id: "primary",
      providers: [],
    },
    connectors: {
      version: 1,
      mode: params.mode ?? "connectors",
      local_web_ui: {
        enabled: true,
      },
      connectors: {
        telegram: {
          enabled: params.enabled ?? true,
          setup_state: params.token ? "configured" : "unconfigured",
          credential_id: "telegram:default",
        },
        whatsapp: {
          enabled: false,
          setup_state: "unconfigured",
          credential_id: null,
        },
      },
    },
    credentials: {
      version: 1,
      credentials: params.token
        ? {
            "telegram:default": {
              type: "bot_token",
              value: params.token,
            },
          }
        : {},
    },
  });
}

describe("mirror telegram runtime", () => {
  it("stays disabled when connector mode does not allow connectors", async () => {
    const homeRoot = await createTempHome("mirror-telegram-disabled-");
    writeTelegramSettings({
      homeRoot,
      mode: "local_ui",
      enabled: true,
      token: "telegram-token",
    });

    const runtime = await createMirrorTelegramRuntime({
      settings: loadMirrorSettingsSync(),
      onMessage: async () => "unused",
    });

    expect(runtime.getStatus().state).toBe("disabled");
    await runtime.shutdown();
  });

  it("reports unconfigured when token is missing", async () => {
    const homeRoot = await createTempHome("mirror-telegram-unconfigured-");
    writeTelegramSettings({
      homeRoot,
      mode: "connectors",
      enabled: true,
    });

    const runtime = await createMirrorTelegramRuntime({
      settings: loadMirrorSettingsSync(),
      onMessage: async () => "unused",
    });

    expect(runtime.getStatus().state).toBe("unconfigured");
    await runtime.shutdown();
  });

  it("reports token_invalid when Telegram rejects the bot token", async () => {
    const homeRoot = await createTempHome("mirror-telegram-invalid-");
    writeTelegramSettings({
      homeRoot,
      token: "telegram-token",
    });

    const fetchImpl = vi.fn(async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({
          ok: false,
          description: "Unauthorized",
        }),
      } as Response;
    });

    const runtime = await createMirrorTelegramRuntime({
      settings: loadMirrorSettingsSync(),
      fetchImpl,
      onMessage: async () => "unused",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(runtime.getStatus().state).toBe("token_invalid");
    expect(runtime.getStatus().last_error_summary).toBe("Unauthorized");
    expect(runtime.getStatus().last_error_at).toBeTruthy();
    await runtime.shutdown();
  });

  it("polls updates and routes replies through the adapter callback", async () => {
    const homeRoot = await createTempHome("mirror-telegram-running-");
    writeTelegramSettings({
      homeRoot,
      token: "telegram-token",
    });

    const sentMessages: Array<{
      chat_id: number;
      reply_to_message_id?: number;
      text: string;
    }> = [];
    let getUpdatesCalls = 0;
    const onMessage = vi.fn(async (message) => {
      expect(message.text).toBe("hello mirror");
      return "Mirror reply";
    });
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = fetchTarget(url);
      const body = parseJsonBody(init);
      if (target.endsWith("/getMe")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              id: 1,
              is_bot: true,
              username: "mirror_bot",
            },
          }),
        } as Response;
      }
      if (target.endsWith("/getUpdates")) {
        getUpdatesCalls += 1;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result:
              getUpdatesCalls === 1
                ? [
                    {
                      update_id: 1,
                      message: {
                        message_id: 10,
                        text: "hello mirror",
                        chat: {
                          id: 42,
                          type: "private",
                        },
                        from: {
                          id: 99,
                          username: "alice",
                          first_name: "Alice",
                        },
                      },
                    },
                  ]
                : [],
          }),
        } as Response;
      }
      if (target.endsWith("/sendMessage")) {
        sentMessages.push({
          chat_id: typeof body.chat_id === "number" ? body.chat_id : 0,
          reply_to_message_id:
            typeof body.reply_to_message_id === "number" ? body.reply_to_message_id : undefined,
          text: typeof body.text === "string" ? body.text : "",
        });
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: { message_id: 11 },
          }),
        } as Response;
      }
      throw new Error(`unexpected telegram url: ${target}`);
    });

    const runtime = await createMirrorTelegramRuntime({
      settings: loadMirrorSettingsSync(),
      fetchImpl,
      onMessage,
      pollTimeoutSeconds: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(runtime.getStatus().state).toBe("running");
    expect(runtime.getStatus().bot).toEqual({
      id: 1,
      username: "mirror_bot",
      display_name: "mirror_bot",
    });
    expect(runtime.getStatus().last_successful_poll_at).toBeTruthy();
    expect(runtime.getStatus().updates_processed).toBe(1);
    expect(runtime.getStatus().last_error_summary).toBeNull();
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(sentMessages).toEqual([
      {
        chat_id: 42,
        reply_to_message_id: 10,
        text: "Mirror reply",
      },
    ]);

    await runtime.shutdown();
  });

  it("records runtime poll failures with error diagnostics", async () => {
    const homeRoot = await createTempHome("mirror-telegram-poll-error-");
    writeTelegramSettings({
      homeRoot,
      token: "telegram-token",
    });

    let getUpdatesCalls = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = fetchTarget(url);
      if (target.endsWith("/getMe")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              id: 1,
              is_bot: true,
              username: "mirror_bot",
            },
          }),
        } as Response;
      }
      if (target.endsWith("/getUpdates")) {
        getUpdatesCalls += 1;
        if (getUpdatesCalls === 1) {
          return {
            ok: false,
            status: 500,
            json: async () => ({
              ok: false,
              description: "Telegram unavailable",
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: [],
          }),
        } as Response;
      }
      throw new Error(`unexpected telegram url: ${target}`);
    });

    const runtime = await createMirrorTelegramRuntime({
      settings: loadMirrorSettingsSync(),
      fetchImpl,
      onMessage: async () => "unused",
      pollTimeoutSeconds: 0,
      retryDelayMs: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(runtime.getStatus().last_error_summary).toBe("Telegram unavailable");
    expect(runtime.getStatus().last_error_at).toBeTruthy();
    expect(runtime.getStatus().bot?.username).toBe("mirror_bot");

    await runtime.shutdown();
  });
});
