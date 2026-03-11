import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendMirrorJournalEntry } from "../mirror-daemon/journal.js";
import type { MirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import { createMirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import { createNonExitingRuntime } from "../runtime.js";
import {
  completeBrainChatViaMirrorProvider,
  summarizeMirrorRunViaProvider,
} from "./mirror-provider-bridge.js";
import { startRuntimeServer, type RuntimeServerServiceOverrides } from "./server.js";

async function withIsolatedWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-operator-evidence-"));
  try {
    process.chdir(root);
    await run(root);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(root, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withRunningServer(
  options: {
    services?: RuntimeServerServiceOverrides;
    brainUrl?: string;
    authToken?: string;
    providerRuntime?: MirrorDaemonProviderRuntime;
  },
  run: (ctx: { baseUrl: string; token: string }) => Promise<void>,
): Promise<void> {
  process.env.MIRROR_DAEMON_TOKEN = "daemon-test-token";
  const app = await startRuntimeServer(
    createNonExitingRuntime(),
    options.brainUrl,
    options.authToken,
    {
      requireRuntimeEnabledEnv: false,
      services: options.services,
      providerRuntime: options.providerRuntime,
    },
  );
  const server = await new Promise<import("node:http").Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.on("error", reject);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run({ baseUrl, token: "daemon-test-token" });
  } finally {
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
    });
  }
}

async function fetchJson(
  url: string,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

async function postJson(
  url: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const responseBody = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body: responseBody };
}

afterEach(() => {
  delete process.env.MIRROR_DAEMON_TOKEN;
});

describe("runtime operator evidence endpoints", () => {
  it("returns journal entries and supports newest-first order + limit", async () => {
    await withIsolatedWorkspace(async (root) => {
      const journalPath = path.join(root, ".mirror", "run_journal.jsonl");
      await appendMirrorJournalEntry(
        { event_type: "policy.decision", trace_id: "trace-1", reason: "first" },
        journalPath,
      );
      await appendMirrorJournalEntry(
        { event_type: "tool.executed", trace_id: "trace-2", tool_name: "echo", ok: true },
        journalPath,
      );
      await appendMirrorJournalEntry(
        { event_type: "tool.failed", trace_id: "trace-3", error: "boom" },
        journalPath,
      );

      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/mirror/journal?limit=2`, token);
        expect(result.status).toBe(200);
        expect(result.body.order).toBe("newest-first");
        expect(result.body.count).toBe(2);
        const entries = result.body.entries as Array<{ trace_id: string }>;
        expect(entries.map((entry) => entry.trace_id)).toEqual(["trace-3", "trace-2"]);
      });
    });
  });

  it("applies journal type and trace filters", async () => {
    await withIsolatedWorkspace(async (root) => {
      const journalPath = path.join(root, ".mirror", "run_journal.jsonl");
      await appendMirrorJournalEntry(
        { event_type: "tool.executed", trace_id: "trace-a", tool_name: "a", ok: true },
        journalPath,
      );
      await appendMirrorJournalEntry(
        { event_type: "tool.failed", trace_id: "trace-a", error: "fail-a" },
        journalPath,
      );
      await appendMirrorJournalEntry(
        { event_type: "tool.failed", trace_id: "trace-b", error: "fail-b" },
        journalPath,
      );

      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(
          `${baseUrl}/mirror/journal?type=tool.failed&trace_id=trace-a`,
          token,
        );
        expect(result.status).toBe(200);
        expect(result.body.count).toBe(1);
        const entries = result.body.entries as Array<{ event_type: string; trace_id: string }>;
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ event_type: "tool.failed", trace_id: "trace-a" });
      });
    });
  });

  it("returns pond evidence details for a known pond", async () => {
    await withIsolatedWorkspace(async (root) => {
      const oceanRegistryPath = path.join(root, ".mirror", "ocean_registry.json");
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [
            {
              pond_id: "pond-a",
              name: "Pond A",
              manifest_url: "https://pond-a.example/pond/manifest",
              trust_status: "trusted",
              pubkey_id: "pubkey-a",
              signature_ok: true,
              last_handshake_at: "2026-03-10T10:00:00.000Z",
              last_consult_at: "2026-03-10T10:01:00.000Z",
              last_consult_ok: true,
              remote_runtime: "mirror-runtime",
              remote_ocean_protocol: "ocean-v0",
              last_error: "none",
            },
          ],
        })}\n`,
        "utf-8",
      );

      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/ocean/ponds/pond-a/evidence`, token);
        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
          pond_id: "pond-a",
          name: "Pond A",
          manifest_url: "https://pond-a.example/pond/manifest",
          trust_status: "trusted",
          pubkey_id: "pubkey-a",
          signature_ok: true,
          last_handshake_at: "2026-03-10T10:00:00.000Z",
          last_consult_at: "2026-03-10T10:01:00.000Z",
          last_consult_ok: true,
          remote_runtime: "mirror-runtime",
          remote_ocean_protocol: "ocean-v0",
          last_error: "none",
        });
      });
    });
  });

  it("returns provider status without exposing secrets", async () => {
    await withIsolatedWorkspace(async () => {
      process.env.MIRROR_PROVIDER = "brain-chat";
      process.env.MIRROR_PROVIDER_MODEL = "gpt-4o-mini";

      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
          provider: "brain-chat",
          default_model: "gpt-4o-mini",
          source: { runtime_snapshot: false },
          provider_env: {
            MIRROR_PROVIDER: "brain-chat",
            MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
          },
          adapter: "brain-chat",
          evidence: {
            effective_provider: "brain-chat",
            effective_model: "gpt-4o-mini",
          },
        });
        expect(result.body.recent_invocations).toEqual([]);
        expect(result.body).not.toHaveProperty("token");
        expect(result.body).not.toHaveProperty("authToken");
      });
    });
  });

  it("includes last invocation summary from brain chat bridge path in provider status", async () => {
    await withIsolatedWorkspace(async () => {
      const providerRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        resolveProviderCredentials: async () => ({ apiKey: "unused-token" }),
      });
      await completeBrainChatViaMirrorProvider({
        env: createNonExitingRuntime(),
        brainUrl: "http://brain.local/chat",
        authToken: "token",
        request: {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
        },
        transport: async () => ({
          id: "chat-provider-summary",
          object: "chat.completion",
          created: 1,
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "pong" },
              finish_reason: "stop",
            },
          ],
        }),
        invocationRecorder: providerRuntime,
      });

      await withRunningServer({ providerRuntime }, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
          invocation_summary: {
            last_provider: "mirror.brain-chat",
            last_model: "gpt-4o-mini",
            last_outcome: "ok",
          },
          recent_invocations: [
            {
              provider: "mirror.brain-chat",
              model: "gpt-4o-mini",
              outcome: "ok",
            },
          ],
        });
      });
    });
  });

  it("uses injected provider runtime object for brain chat execution", async () => {
    await withIsolatedWorkspace(async () => {
      const providerRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        authToken: "brain-token",
        resolveProviderCredentials: async () => ({ apiKey: "unused" }),
      });
      const executeBrainChat = vi.fn(async () => ({
        ok: true as const,
        completion: {
          provider: "mirror.brain-chat",
          model: "gpt-4o-mini",
          text: "pong",
        },
        response: {
          id: "chat-runtime-route",
          object: "chat.completion",
          created: 1,
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "pong" },
              finish_reason: "stop",
            },
          ],
        },
      }));
      providerRuntime.executeBrainChat = executeBrainChat;

      await withRunningServer(
        {
          brainUrl: "http://brain.local/chat",
          authToken: "brain-token",
          providerRuntime,
        },
        async ({ baseUrl, token }) => {
          const result = await postJson(
            `${baseUrl}/api/brain/chat`,
            {
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: "ping" }],
            },
            token,
          );
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            model: "gpt-4o-mini",
            choices: [
              {
                message: { content: "pong" },
              },
            ],
          });
          expect(executeBrainChat).toHaveBeenCalledWith({
            request: {
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: "ping" }],
            },
          });
        },
      );
    });
  });

  it("reports alias normalization and configured token evidence in provider status", async () => {
    await withIsolatedWorkspace(async () => {
      process.env.MIRROR_PROVIDER = "mirror.brain-chat";
      process.env.MIRROR_PROVIDER_MODEL = "gpt-4o-mini";
      const resolver = vi.fn(async () => {
        throw new Error("resolver should not be called when auth token is configured");
      });

      await withRunningServer(
        {
          authToken: "configured-daemon-token",
          services: {
            resolveMirrorProviderCredentials: resolver,
          },
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            provider: "brain-chat",
            default_model: "gpt-4o-mini",
            evidence: {
              effective_provider: "brain-chat",
              effective_model: "gpt-4o-mini",
              alias_normalized_from: "mirror.brain-chat",
              auth_source: "configured_token",
              credential_resolution_attempted: false,
            },
          });
          expect(resolver).not.toHaveBeenCalled();
        },
      );
    });
  });

  it("reports resolved credential evidence in provider status", async () => {
    await withIsolatedWorkspace(async () => {
      process.env.MIRROR_PROVIDER = "brain-chat";
      process.env.MIRROR_PROVIDER_MODEL = "gpt-4o-mini";
      const resolver = vi.fn(async () => ({
        provider: "brain-chat",
        apiKey: "resolved-api-key",
        source: "test",
        mode: "api-key" as const,
      }));

      await withRunningServer(
        {
          services: {
            resolveMirrorProviderCredentials: resolver,
          },
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            provider: "brain-chat",
            evidence: {
              auth_source: "resolved_credentials",
              credential_resolution_attempted: true,
              credential_resolution_ok: true,
            },
          });
          expect(resolver).toHaveBeenCalledWith({ provider: "brain-chat" });
        },
      );
    });
  });

  it("uses injected provider runtime object for status and health checks", async () => {
    await withIsolatedWorkspace(async () => {
      const providerRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        authToken: undefined,
        resolveProviderCredentials: async () => ({ apiKey: "injected-provider-token" }),
      });
      const getProviderStatus = vi.fn(async () => ({
        provider: "brain-chat",
        default_model: "gpt-4o-mini",
        source: {
          runtime_snapshot: false,
        },
        provider_env: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        adapter: "brain-chat" as const,
        invocation_summary: null,
        evidence: {
          effective_provider: "brain-chat",
          effective_model: "gpt-4o-mini",
          auth_source: "resolved_credentials" as const,
          credential_resolution_attempted: true,
          credential_resolution_ok: true,
        },
      }));
      const probeProviderHealth = vi.fn(async () => ({
        provider: "brain-chat",
        model: "gpt-4o-mini",
        configured: true,
        reachable: true,
        ok: true,
        source: {
          runtime_snapshot: false,
        },
        invocation_summary: null,
        evidence: {
          effective_provider: "brain-chat",
          effective_model: "gpt-4o-mini",
          auth_source: "resolved_credentials" as const,
          credential_resolution_attempted: true,
          credential_resolution_ok: true,
        },
      }));
      providerRuntime.getProviderStatus = getProviderStatus;
      providerRuntime.probeProviderHealth = probeProviderHealth;

      process.env.MIRROR_DAEMON_TOKEN = "daemon-test-token";
      const app = await startRuntimeServer(createNonExitingRuntime(), undefined, undefined, {
        requireRuntimeEnabledEnv: false,
        providerRuntime,
      });
      const server = await new Promise<import("node:http").Server>((resolve, reject) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
        listener.on("error", reject);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const statusResult = await fetchJson(
          `${baseUrl}/mirror/provider/status`,
          "daemon-test-token",
        );
        const healthResult = await fetchJson(
          `${baseUrl}/mirror/provider/health`,
          "daemon-test-token",
        );
        expect(statusResult.status).toBe(200);
        expect(healthResult.status).toBe(200);
        expect(getProviderStatus).toHaveBeenCalledWith({
          runtimeSnapshot: false,
        });
        expect(probeProviderHealth).toHaveBeenCalledWith({
          runtimeSnapshot: false,
        });
      } finally {
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
        });
      }
    });
  });

  it("uses injected resolver context consistently across provider status and health", async () => {
    await withIsolatedWorkspace(async () => {
      process.env.MIRROR_PROVIDER = "brain-chat";
      process.env.MIRROR_PROVIDER_MODEL = "gpt-4o-mini";
      const resolver = vi.fn(async () => ({
        provider: "brain-chat",
        apiKey: "resolved-api-key",
        source: "test",
        mode: "api-key" as const,
      }));

      await withRunningServer(
        {
          services: {
            resolveProviderCredentials: resolver,
          },
        },
        async ({ baseUrl, token }) => {
          const statusResult = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
          const healthResult = await fetchJson(`${baseUrl}/mirror/provider/health`, token);

          expect(statusResult.status).toBe(200);
          expect(healthResult.status).toBe(200);
          expect(statusResult.body).toMatchObject({
            evidence: {
              auth_source: "resolved_credentials",
              credential_resolution_attempted: true,
              credential_resolution_ok: true,
            },
          });
          expect(healthResult.body).toMatchObject({
            evidence: {
              auth_source: "resolved_credentials",
              credential_resolution_attempted: true,
              credential_resolution_ok: true,
            },
          });
          expect(resolver).toHaveBeenNthCalledWith(1, { provider: "brain-chat" });
          expect(resolver).toHaveBeenNthCalledWith(2, { provider: "brain-chat" });
        },
      );
    });
  });

  it("returns 404 when pond evidence target is missing", async () => {
    await withIsolatedWorkspace(async () => {
      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/ocean/ponds/missing-pond/evidence`, token);
        expect(result.status).toBe(404);
        expect(result.body.error).toBe("unknown pond_id: missing-pond");
      });
    });
  });

  it("enforces token auth for operator evidence endpoints", async () => {
    await withIsolatedWorkspace(async () => {
      await withRunningServer({}, async ({ baseUrl, token }) => {
        const withoutToken = await fetchJson(`${baseUrl}/mirror/journal`);
        expect(withoutToken.status).toBe(401);
        const providerWithoutToken = await fetchJson(`${baseUrl}/mirror/provider/status`);
        expect(providerWithoutToken.status).toBe(401);
        const providerHealthWithoutToken = await fetchJson(`${baseUrl}/mirror/provider/health`);
        expect(providerHealthWithoutToken.status).toBe(401);

        const withToken = await fetchJson(`${baseUrl}/mirror/journal`, token);
        expect(withToken.status).toBe(200);
        const providerWithToken = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
        expect(providerWithToken.status).toBe(200);
        const providerHealthWithToken = await fetchJson(`${baseUrl}/mirror/provider/health`, token);
        expect(providerHealthWithToken.status).toBe(200);
      });
    });
  });

  it("returns provider health probe success and failure", async () => {
    await withIsolatedWorkspace(async () => {
      const successRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        resolveProviderCredentials: async () => ({ apiKey: "unused-token" }),
      });
      successRuntime.probeProviderHealth = async () => ({
        provider: "mirror.brain-chat",
        model: "gpt-4o-mini",
        configured: true,
        reachable: true,
        ok: true,
        source: {
          runtime_snapshot: false,
        },
        invocation_summary: null,
        evidence: {
          effective_provider: "brain-chat",
          effective_model: "gpt-4o-mini",
          auth_source: "configured_token",
          credential_resolution_attempted: false,
        },
      });
      await withRunningServer(
        {
          providerRuntime: successRuntime,
        },
        async ({ baseUrl, token }) => {
          const success = await fetchJson(`${baseUrl}/mirror/provider/health`, token);
          expect(success.status).toBe(200);
          expect(success.body).toMatchObject({
            provider: "mirror.brain-chat",
            model: "gpt-4o-mini",
            configured: true,
            reachable: true,
            ok: true,
            evidence: {
              auth_source: "configured_token",
            },
          });
        },
      );

      const failureRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        resolveProviderCredentials: async () => ({ apiKey: "unused-token" }),
      });
      failureRuntime.probeProviderHealth = async () => ({
        provider: "brain-chat",
        model: "gpt-4o-mini",
        configured: true,
        reachable: false,
        ok: false,
        error: "upstream timeout",
        source: {
          runtime_snapshot: false,
        },
        invocation_summary: null,
        evidence: {
          effective_provider: "brain-chat",
          effective_model: "gpt-4o-mini",
          auth_source: "none",
          credential_resolution_attempted: true,
          credential_resolution_ok: false,
          last_error: "provider credentials unavailable",
        },
      });
      await withRunningServer(
        {
          providerRuntime: failureRuntime,
        },
        async ({ baseUrl, token }) => {
          const failure = await fetchJson(`${baseUrl}/mirror/provider/health`, token);
          expect(failure.status).toBe(200);
          expect(failure.body).toMatchObject({
            provider: "brain-chat",
            model: "gpt-4o-mini",
            configured: true,
            reachable: false,
            ok: false,
            error: "upstream timeout",
            evidence: {
              last_error: "provider credentials unavailable",
            },
          });
        },
      );
    });
  });

  it("exposes bounded recent provider invocations in status and health", async () => {
    await withIsolatedWorkspace(async () => {
      const providerRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        resolveProviderCredentials: async () => ({ apiKey: "unused-token" }),
      });

      for (let index = 0; index < 12; index += 1) {
        if (index % 2 === 0) {
          providerRuntime.recordInvocationSuccess({
            provider: `mirror.brain-chat-${index}`,
            model: `model-${index}`,
          });
          continue;
        }
        providerRuntime.recordInvocationFailure({
          provider: `mirror.brain-chat-${index}`,
          model: `model-${index}`,
          error: `Bearer secret-${index} failed`,
        });
      }

      await withRunningServer(
        {
          providerRuntime,
        },
        async ({ baseUrl, token }) => {
          const statusResult = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
          const healthResult = await fetchJson(`${baseUrl}/mirror/provider/health`, token);

          expect(statusResult.status).toBe(200);
          expect(healthResult.status).toBe(200);
          const statusRecent = statusResult.body.recent_invocations as Array<
            Record<string, unknown>
          >;
          const healthRecent = healthResult.body.recent_invocations as Array<
            Record<string, unknown>
          >;
          expect(statusRecent).toHaveLength(10);
          expect(healthRecent).toHaveLength(10);
          expect(statusRecent[0]).toMatchObject({
            provider: "mirror.brain-chat-11",
            model: "model-11",
            outcome: "error",
            error: "Bearer [redacted] failed",
          });
          expect(statusRecent[9]).toMatchObject({
            provider: "mirror.brain-chat-2",
            model: "model-2",
            outcome: "ok",
          });
          expect(JSON.stringify(statusRecent)).not.toContain("secret-11");
          expect(healthRecent[0]).toEqual(statusRecent[0]);
        },
      );
    });
  });

  it("includes last invocation summary from run summary bridge path in provider health", async () => {
    await withIsolatedWorkspace(async () => {
      const providerRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        resolveProviderCredentials: async () => ({ apiKey: "unused-token" }),
      });
      await summarizeMirrorRunViaProvider({
        env: createNonExitingRuntime(),
        brainUrl: "http://brain.local/chat",
        authToken: "token",
        summary: { trace_id: "run-1", status: "completed" },
        events: [],
        transport: async () => ({
          id: "chat-provider-health-summary",
          object: "chat.completion",
          created: 1,
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "summarized" },
              finish_reason: "stop",
            },
          ],
        }),
        invocationRecorder: providerRuntime,
      });
      providerRuntime.probeProviderHealth = async () => ({
        provider: "brain-chat",
        model: "gpt-4o-mini",
        configured: true,
        reachable: true,
        ok: true,
        source: {
          runtime_snapshot: false,
        },
        invocation_summary: providerRuntime.getInvocationSummary(),
        evidence: {
          effective_provider: "brain-chat",
          effective_model: "gpt-4o-mini",
          auth_source: "resolved_credentials",
          credential_resolution_attempted: true,
          credential_resolution_ok: true,
        },
      });

      await withRunningServer(
        {
          providerRuntime,
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(`${baseUrl}/mirror/provider/health`, token);
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            invocation_summary: {
              last_provider: "mirror.brain-chat",
              last_model: "gpt-4o-mini",
              last_outcome: "ok",
            },
          });
        },
      );
    });
  });

  it("uses injected provider runtime object for run provider summaries", async () => {
    await withIsolatedWorkspace(async (root) => {
      const journalPath = path.join(root, ".mirror", "run_journal.jsonl");
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T11:00:00.000Z",
          event_type: "policy.decision",
          trace_id: "run-provider-summary",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T11:00:01.000Z",
          event_type: "tool.executed",
          trace_id: "run-provider-summary",
          caller_agent: "agent0",
        },
        journalPath,
      );

      const providerRuntime = createMirrorDaemonProviderRuntime({
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
        authToken: "brain-token",
        resolveProviderCredentials: async () => ({ apiKey: "unused" }),
      });
      const summarizeRunViaProvider = vi.fn(async () => ({
        ok: true as const,
        text: "Run completed successfully.",
        provider: "mirror.brain-chat",
        model: "gpt-4o-mini",
      }));
      providerRuntime.summarizeRunViaProvider = summarizeRunViaProvider;

      await withRunningServer(
        {
          brainUrl: "http://brain.local/chat",
          authToken: "brain-token",
          providerRuntime,
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(
            `${baseUrl}/mirror/runs/run-provider-summary?include_provider_summary=1`,
            token,
          );
          expect(result.status).toBe(200);
          expect(result.body.provider_summary).toEqual({
            ok: true,
            text: "Run completed successfully.",
            provider: "mirror.brain-chat",
            model: "gpt-4o-mini",
          });
          expect(summarizeRunViaProvider).toHaveBeenCalledWith({
            summary: expect.objectContaining({
              trace_id: "run-provider-summary",
            }),
            events: [
              expect.objectContaining({
                trace_id: "run-provider-summary",
                event_type: "policy.decision",
              }),
              expect.objectContaining({
                trace_id: "run-provider-summary",
                event_type: "tool.executed",
              }),
            ],
          });
        },
      );
    });
  });

  it("returns sanitized credential resolution failure evidence in provider status", async () => {
    await withIsolatedWorkspace(async () => {
      process.env.MIRROR_PROVIDER = "brain-chat";
      process.env.MIRROR_PROVIDER_MODEL = "gpt-4o-mini";
      await withRunningServer(
        {
          services: {
            resolveMirrorProviderCredentials: async () => {
              throw new Error("sensitive profile stack trace");
            },
          },
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(`${baseUrl}/mirror/provider/status`, token);
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            evidence: {
              auth_source: "none",
              credential_resolution_attempted: true,
              credential_resolution_ok: false,
              last_error: "provider credentials unavailable",
            },
          });
          expect(JSON.stringify(result.body)).not.toContain("sensitive profile stack trace");
        },
      );
    });
  });

  it("returns sanitized credential resolution failure evidence in provider health", async () => {
    await withIsolatedWorkspace(async () => {
      process.env.MIRROR_PROVIDER = "brain-chat";
      process.env.MIRROR_PROVIDER_MODEL = "gpt-4o-mini";
      await withRunningServer(
        {
          services: {
            resolveProviderCredentials: async () => {
              throw new Error("sensitive profile stack trace");
            },
          },
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(`${baseUrl}/mirror/provider/health`, token);
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            configured: false,
            reachable: false,
            ok: false,
            error: "provider transport is not configured",
            evidence: {
              auth_source: "none",
              credential_resolution_attempted: true,
              credential_resolution_ok: false,
              last_error: "provider credentials unavailable",
            },
          });
          expect(JSON.stringify(result.body)).not.toContain("sensitive profile stack trace");
        },
      );
    });
  });
});
