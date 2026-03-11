import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MirrorDaemonReplyRequest } from "../mirror-daemon/reply-backend-adapter.js";
import {
  MIRROR_EXECUTE_ENDPOINT,
  validateMirrorDaemonReplyRequest,
  validateMirrorExecuteResponse,
} from "../mirror-daemon/runtime-http-contract.js";
import { executeMirrorReplyWithLore, handleMirrorExecuteRequest } from "./mirror-execute.js";

function buildRequest(): MirrorDaemonReplyRequest {
  return {
    sessionKey: "agent:main:telegram:direct:42",
    agentId: "main",
    accountId: "telegram-main",
    surface: "telegram",
    text: "hello",
    commandText: "/help",
    flags: {
      commandAuthorized: true,
    },
  };
}

describe("Mirror execute contract", () => {
  const tempDirs: string[] = [];
  const originalRetrievalDebug = process.env.MIRROR_RETRIEVAL_DEBUG;

  afterEach(async () => {
    if (originalRetrievalDebug === undefined) {
      delete process.env.MIRROR_RETRIEVAL_DEBUG;
    } else {
      process.env.MIRROR_RETRIEVAL_DEBUG = originalRetrievalDebug;
    }
    vi.restoreAllMocks();
    await Promise.all(
      tempDirs.map(async (dir) => await fs.rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  it("defines the runtime endpoint path", () => {
    expect(MIRROR_EXECUTE_ENDPOINT).toBe("/mirror/execute");
  });

  it("validates a well-formed MirrorDaemonReplyRequest", () => {
    expect(validateMirrorDaemonReplyRequest(buildRequest())).toEqual({
      ok: true,
      value: buildRequest(),
    });
  });

  it("returns the stub response shape for a valid request", async () => {
    const result = await handleMirrorExecuteRequest({
      body: buildRequest(),
      executeMirrorReply: async () => ({ text: "[mirror-runtime stub response]" }),
    });

    expect(result).toEqual({
      statusCode: 200,
      body: { text: "[mirror-runtime stub response]" },
    });
    expect(validateMirrorExecuteResponse(result.body)).toEqual({
      ok: true,
      value: { text: "[mirror-runtime stub response]" },
    });
  });

  it("maps request validation failures to 400", async () => {
    const result = await handleMirrorExecuteRequest({
      body: {
        sessionKey: "",
        agentId: "main",
        surface: "telegram",
        text: "hello",
      },
      executeMirrorReply: async () => ({ text: "unused" }),
    });

    expect(result).toEqual({
      statusCode: 400,
      body: { error: "sessionKey is required" },
    });
  });

  it("maps invalid response payloads to 500", async () => {
    const result = await handleMirrorExecuteRequest({
      body: buildRequest(),
      executeMirrorReply: async () => ({ invalid: true }) as never,
    });

    expect(result).toEqual({
      statusCode: 500,
      body: { error: "response payload is invalid" },
    });
  });

  it("maps handler exceptions to 500", async () => {
    const result = await handleMirrorExecuteRequest({
      body: buildRequest(),
      executeMirrorReply: async () => {
        throw new Error("mirror execute boom");
      },
    });

    expect(result).toEqual({
      statusCode: 500,
      body: { error: "Error: mirror execute boom" },
    });
  });

  it("returns a non-stub reply when lore exists", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-execute-"));
    tempDirs.push(root);
    await fs.writeFile(
      path.join(root, "chapel.md"),
      "# Moon Chapel\nThe chapel lantern is lit when travelers return from the causeway.",
      "utf-8",
    );
    const executeBrainChat = vi.fn(
      async ({ request }: { request: { messages: Array<{ content: string }> } }) => ({
        ok: true as const,
        completion: {
          provider: "mirror.brain-chat",
          model: "gpt-4o-mini",
          text: "The chapel keeps a lantern for returning travelers.",
        },
        response: {
          id: "chat-1",
          object: "chat.completion",
          created: 1,
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: request.messages[1]?.content.includes("Moon Chapel")
                  ? "The chapel keeps a lantern for returning travelers."
                  : "Lore was not supplied.",
              },
              finish_reason: "stop",
            },
          ],
        },
      }),
    );

    const reply = await executeMirrorReplyWithLore({
      request: {
        ...buildRequest(),
        text: "What does the moon chapel keep for travelers?",
      },
      loreDir: root,
      providerRuntime: {
        resolveProviderConfig: () => ({ provider: "brain-chat", model: "gpt-4o-mini" }),
        executeBrainChat,
      },
    });

    expect(reply).toEqual({
      text: "The chapel keeps a lantern for returning travelers.",
    });
    expect(executeBrainChat).toHaveBeenCalledTimes(1);
    expect(executeBrainChat.mock.calls[0]?.[0].request.messages[1]?.content).toContain(
      "Moon Chapel",
    );
  });

  it("logs selected retrieval metadata without logging full scroll bodies", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-retrieval-"));
    tempDirs.push(root);
    const body =
      "# Moon Chapel\nThe chapel lantern is lit when travelers return from the causeway with the long hidden river oath.";
    await fs.writeFile(path.join(root, "chapel.md"), body, "utf-8");
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await executeMirrorReplyWithLore({
      request: {
        ...buildRequest(),
        text: "What does the moon chapel keep for travelers?",
      },
      loreDir: root,
      providerRuntime: {
        resolveProviderConfig: () => ({ provider: "brain-chat", model: "gpt-4o-mini" }),
        executeBrainChat: async () => ({
          ok: true as const,
          completion: {
            provider: "mirror.brain-chat",
            model: "gpt-4o-mini",
            text: "The chapel keeps a lantern for returning travelers.",
          },
          response: {
            id: "chat-1",
            object: "chat.completion",
            created: 1,
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant" as const,
                  content: "The chapel keeps a lantern for returning travelers.",
                },
                finish_reason: "stop",
              },
            ],
          },
        }),
      },
    });

    expect(debugSpy).toHaveBeenCalledWith(
      "[mirror-retrieval]",
      expect.objectContaining({
        lore_dir: root,
        candidate_count: 1,
        snippet_count: 1,
        selected_files: ["chapel.md"],
        selected_titles: ["Moon Chapel"],
      }),
    );
    expect(JSON.stringify(debugSpy.mock.calls)).not.toContain("long hidden river oath");
  });

  it("includes score details only when MIRROR_RETRIEVAL_DEBUG=1", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-retrieval-debug-"));
    tempDirs.push(root);
    await fs.writeFile(
      path.join(root, "chapel.md"),
      "# Moon Chapel\nThe chapel lantern is lit.",
      "utf-8",
    );
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    process.env.MIRROR_RETRIEVAL_DEBUG = "1";

    await executeMirrorReplyWithLore({
      request: {
        ...buildRequest(),
        text: "moon chapel",
      },
      loreDir: root,
      providerRuntime: {
        resolveProviderConfig: () => ({ provider: "brain-chat", model: "gpt-4o-mini" }),
        executeBrainChat: async () => ({
          ok: true as const,
          completion: {
            provider: "mirror.brain-chat",
            model: "gpt-4o-mini",
            text: "The chapel keeps a lantern.",
          },
          response: {
            id: "chat-2",
            object: "chat.completion",
            created: 1,
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant" as const,
                  content: "The chapel keeps a lantern.",
                },
                finish_reason: "stop",
              },
            ],
          },
        }),
      },
    });

    expect(debugSpy).toHaveBeenCalledWith(
      "[mirror-retrieval]",
      expect.objectContaining({
        selected: [
          expect.objectContaining({
            filename: "chapel.md",
            title: "Moon Chapel",
            score: expect.any(Number),
          }),
        ],
      }),
    );
  });

  it("falls back safely when the lore directory is missing or empty", async () => {
    const executeBrainChat = vi.fn(async () => ({
      ok: true as const,
      completion: {
        provider: "mirror.brain-chat",
        model: "gpt-4o-mini",
        text: "I do not find a matching scroll, but I can still answer plainly.",
      },
      response: {
        id: "chat-2",
        object: "chat.completion",
        created: 1,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: "I do not find a matching scroll, but I can still answer plainly.",
            },
            finish_reason: "stop",
          },
        ],
      },
    }));

    const reply = await executeMirrorReplyWithLore({
      request: buildRequest(),
      loreDir: "/tmp/definitely-missing-mirror-execute-lore",
      providerRuntime: {
        resolveProviderConfig: () => ({ provider: "brain-chat", model: "gpt-4o-mini" }),
        executeBrainChat,
      },
    });

    expect(reply.text).toBe("I do not find a matching scroll, but I can still answer plainly.");
    expect(executeBrainChat.mock.calls[0]?.[0].request.messages[1]?.content).toContain(
      "No relevant scroll excerpts were found.",
    );
  });

  it("surfaces the configured brain URL hint when the provider runtime is missing brainUrl", async () => {
    await expect(
      executeMirrorReplyWithLore({
        request: buildRequest(),
        providerRuntime: {
          resolveProviderConfig: () => ({ provider: "brain-chat", model: "gpt-4o-mini" }),
          executeBrainChat: async () => ({
            ok: false as const,
            error: {
              code: "E_BRAIN_URL_NOT_CONFIGURED",
              message:
                "brainUrl not configured; set MIRROR_BRAIN_URL, .mirror/config.json brain.url, or --brain-url",
              provider: "mirror.brain-chat",
            },
          }),
        },
      }),
    ).rejects.toThrow(
      "[E_BRAIN_URL_NOT_CONFIGURED] brainUrl not configured; set MIRROR_BRAIN_URL, .mirror/config.json brain.url, or --brain-url",
    );
  });
});
