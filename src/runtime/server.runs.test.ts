import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendMirrorJournalEntry } from "../mirror-daemon/journal.js";
import { createMirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import { createNonExitingRuntime } from "../runtime.js";
import {
  startRuntimeServer,
  type RuntimeServerOptions,
  type RuntimeServerServiceOverrides,
} from "./server.js";

async function withIsolatedWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runs-api-"));
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
    providerRuntime?: RuntimeServerOptions["providerRuntime"];
    brainUrl?: string;
    authToken?: string;
  },
  run: (ctx: { baseUrl: string; token: string }) => Promise<void>,
): Promise<void> {
  process.env.MIRROR_DAEMON_TOKEN = "daemon-runs-token";
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
    await run({ baseUrl, token: "daemon-runs-token" });
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

afterEach(() => {
  delete process.env.MIRROR_DAEMON_TOKEN;
});

describe("Mirror runs API", () => {
  it("lists aggregated runs with counts, status, and filters", async () => {
    await withIsolatedWorkspace(async (root) => {
      const journalPath = path.join(root, ".mirror", "run_journal.jsonl");
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T10:00:00.000Z",
          event_type: "policy.decision",
          trace_id: "run-ok",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T10:00:01.000Z",
          event_type: "approval.requested",
          trace_id: "run-ok",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T10:00:02.000Z",
          event_type: "approval.granted",
          trace_id: "run-ok",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T10:00:03.000Z",
          event_type: "tool.executed",
          trace_id: "run-ok",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T10:01:00.000Z",
          event_type: "policy.decision",
          trace_id: "run-fail",
          caller_agent: "agent1",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T10:01:01.000Z",
          event_type: "tool.failed",
          trace_id: "run-fail",
          caller_agent: "agent1",
        },
        journalPath,
      );

      await withRunningServer({}, async ({ baseUrl, token }) => {
        const allRuns = await fetchJson(`${baseUrl}/mirror/runs?limit=10`, token);
        expect(allRuns.status).toBe(200);
        expect(allRuns.body.order).toBe("newest-first");
        expect(allRuns.body.count).toBe(2);
        const runs = allRuns.body.runs as Array<Record<string, unknown>>;
        expect(runs[0]?.trace_id).toBe("run-fail");
        expect(runs[0]?.status).toBe("failed");
        expect(runs[0]?.tool_count).toBe(1);
        expect(runs[0]?.approval_count).toBe(0);
        expect(runs[1]?.trace_id).toBe("run-ok");
        expect(runs[1]?.status).toBe("completed");
        expect(runs[1]?.tool_count).toBe(1);
        expect(runs[1]?.approval_count).toBe(2);

        const filteredByAgent = await fetchJson(
          `${baseUrl}/mirror/runs?caller_agent=agent0`,
          token,
        );
        expect(filteredByAgent.status).toBe(200);
        expect(filteredByAgent.body.count).toBe(1);
        const agentRuns = filteredByAgent.body.runs as Array<Record<string, unknown>>;
        expect(agentRuns[0]?.trace_id).toBe("run-ok");

        const filteredByStatus = await fetchJson(`${baseUrl}/mirror/runs?status=failed`, token);
        expect(filteredByStatus.status).toBe(200);
        expect(filteredByStatus.body.count).toBe(1);
        const failedRuns = filteredByStatus.body.runs as Array<Record<string, unknown>>;
        expect(failedRuns[0]?.trace_id).toBe("run-fail");
      });
    });
  });

  it("returns one run with summary and ordered events", async () => {
    await withIsolatedWorkspace(async (root) => {
      const journalPath = path.join(root, ".mirror", "run_journal.jsonl");
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T11:00:00.000Z",
          event_type: "policy.decision",
          trace_id: "run-detail",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T11:00:01.000Z",
          event_type: "tool.executed",
          trace_id: "run-detail",
          caller_agent: "agent0",
        },
        journalPath,
      );

      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/mirror/runs/run-detail`, token);
        expect(result.status).toBe(200);
        expect(result.body.order).toBe("oldest-first");
        const summary = result.body.summary as Record<string, unknown>;
        expect(summary.trace_id).toBe("run-detail");
        expect(summary.status).toBe("completed");
        expect(summary.tool_count).toBe(1);
        expect(summary.approval_count).toBe(0);

        const events = result.body.events as Array<Record<string, unknown>>;
        expect(events).toHaveLength(2);
        expect(events[0]?.event_type).toBe("policy.decision");
        expect(events[1]?.event_type).toBe("tool.executed");
      });
    });
  });

  it("returns 404 for missing run id", async () => {
    await withIsolatedWorkspace(async () => {
      await withRunningServer({}, async ({ baseUrl, token }) => {
        const result = await fetchJson(`${baseUrl}/mirror/runs/does-not-exist`, token);
        expect(result.status).toBe(404);
        expect(result.body.error).toBe("unknown run id: does-not-exist");
      });
    });
  });

  it("enforces token auth", async () => {
    await withIsolatedWorkspace(async () => {
      await withRunningServer({}, async ({ baseUrl, token }) => {
        const unauthorized = await fetchJson(`${baseUrl}/mirror/runs`);
        expect(unauthorized.status).toBe(401);

        const authorized = await fetchJson(`${baseUrl}/mirror/runs`, token);
        expect(authorized.status).toBe(200);
      });
    });
  });

  it("optionally includes provider summary through internal provider seam", async () => {
    await withIsolatedWorkspace(async (root) => {
      const journalPath = path.join(root, ".mirror", "run_journal.jsonl");
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T11:00:00.000Z",
          event_type: "policy.decision",
          trace_id: "run-summary",
          caller_agent: "agent0",
        },
        journalPath,
      );
      await appendMirrorJournalEntry(
        {
          ts: "2026-03-10T11:00:01.000Z",
          event_type: "tool.executed",
          trace_id: "run-summary",
          caller_agent: "agent0",
        },
        journalPath,
      );

      await withRunningServer(
        {
          brainUrl: "http://brain.local/chat",
          authToken: "brain-token",
          providerRuntime: Object.assign(
            createMirrorDaemonProviderRuntime({
              providerEnv: {
                MIRROR_PROVIDER: "brain-chat",
                MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
              },
              authToken: "brain-token",
              resolveProviderCredentials: async () => ({ apiKey: "unused" }),
            }),
            {
              summarizeRunViaProvider: async () => ({
                ok: true as const,
                text: "Run completed successfully.",
                provider: "mirror.brain-chat",
                model: "gpt-4o-mini",
              }),
            },
          ),
        },
        async ({ baseUrl, token }) => {
          const result = await fetchJson(
            `${baseUrl}/mirror/runs/run-summary?include_provider_summary=1`,
            token,
          );
          expect(result.status).toBe(200);
          expect(result.body.provider_summary).toEqual({
            ok: true,
            text: "Run completed successfully.",
            provider: "mirror.brain-chat",
            model: "gpt-4o-mini",
          });
        },
      );
    });
  });
});
