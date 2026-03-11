import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";
import { startMirrorDaemon } from "./index.js";

async function startOpenAICompatibleStub(params: {
  onRequest?: (body: Record<string, unknown>) => void;
}) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
    params.onRequest?.(body);

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "chatcmpl-direct-test",
        object: "chat.completion",
        created: 1,
        model: typeof body.model === "string" ? body.model : "stub-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "The moon chapel keeps a lantern for returning travelers.",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 9,
          total_tokens: 20,
        },
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (!error) {
            resolve();
            return;
          }
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ERR_SERVER_NOT_RUNNING") {
            resolve();
            return;
          }
          reject(error);
        });
      }),
  };
}

const socketIntegration = process.env.OPENCLAW_SOCKET_TESTS === "1" ? it : it.skip;

describe("MirrorDaemon direct provider integration", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
    vi.restoreAllMocks();
  });

  socketIntegration(
    "serves /mirror/execute through direct mode and sends an OpenAI-compatible upstream request",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-direct-provider-"));
      tempDirs.push(root);
      const loreDir = path.join(root, "scrolls");
      await fs.mkdir(loreDir, { recursive: true });
      await fs.writeFile(
        path.join(loreDir, "chapel.md"),
        "# Moon Chapel\nThe chapel lantern is lit when travelers return from the causeway.",
        "utf-8",
      );

      let capturedBody: Record<string, unknown> | undefined;
      const stub = await startOpenAICompatibleStub({
        onRequest: (body) => {
          capturedBody = body;
        },
      });

      const runtimeEnv = createNonExitingRuntime();
      runtimeEnv.log = vi.fn();
      runtimeEnv.error = vi.fn();

      const daemon = await startMirrorDaemon({
        port: 0,
        cwd: root,
        env: {
          MIRROR_DAEMON_TOKEN: "direct-daemon-token",
          MIRROR_LORE_DIR: loreDir,
          MIRROR_PROVIDER_MODE: "direct",
          MIRROR_PROVIDER_KIND: "openai_compat",
          MIRROR_PROVIDER_BASE_URL: stub.baseUrl,
          MIRROR_PROVIDER_CHAT_PATH: "/v1/chat/completions",
          MIRROR_PROVIDER_API_KEY: "direct-api-key",
          MIRROR_PROVIDER_MODEL: "direct-test-model",
          MIRROR_PROVIDER_TIMEOUT_MS: "90000",
        } as NodeJS.ProcessEnv,
        runtimeEnv,
        pidFilePath: path.join(root, "daemon.pid"),
      });

      try {
        const response = await fetch(`http://127.0.0.1:${daemon.port}/mirror/execute`, {
          method: "POST",
          headers: {
            Authorization: "Bearer direct-daemon-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sessionKey: "agent:main:telegram:direct:42",
            agentId: "main",
            accountId: "telegram-main",
            surface: "telegram",
            text: "What does the moon chapel keep for travelers?",
            flags: {
              commandAuthorized: true,
            },
          }),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          text: "The moon chapel keeps a lantern for returning travelers.",
        });

        expect(capturedBody).toBeDefined();
        expect(capturedBody).toMatchObject({
          model: "direct-test-model",
          temperature: 0.6,
          max_tokens: 220,
          messages: expect.any(Array),
        });
        const messages = (capturedBody?.messages ?? []) as Array<{ role: string; content: string }>;
        expect(messages[0]).toMatchObject({
          role: "system",
        });
        expect(messages[1]?.role).toBe("user");
        expect(messages[1]?.content).toContain("Relevant scroll excerpts:");
        expect(messages[1]?.content).toContain("Moon Chapel");
        expect(messages[1]?.content).toContain("Incoming message:");
        expect(messages[1]?.content).toContain("What does the moon chapel keep for travelers?");

        expect(runtimeEnv.log).toHaveBeenCalledWith("[mirror-provider] mode=direct");
        expect(runtimeEnv.log).toHaveBeenCalledWith(
          expect.stringContaining(
            `mode=direct kind=openai_compat model=direct-test-model endpoint=${stub.baseUrl}/v1/chat/completions`,
          ),
        );
        expect(runtimeEnv.log).toHaveBeenCalledWith(
          expect.stringContaining(
            "completion-success mode=direct kind=openai_compat model=direct-test-model",
          ),
        );
      } finally {
        await daemon.close();
        await stub.close();
      }
    },
  );
});
