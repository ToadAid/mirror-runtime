import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMirrorConsoleHandlers } from "../mirror-console/index.js";
import { createMirrorGateway, createMirrorGatewayHandlers } from "../mirror-gateway/index.js";
import { closeMirrorMemoryDb } from "../mirror-memory/db.js";
import { reviewDraftForCanon } from "../mirror-review/index.js";
import { createMirrorSyncHandlers, createMirrorSyncManager } from "../mirror-sync/index.js";
import {
  createMirrorObservabilityContext,
  createMirrorObservabilityHandlers,
  getMirrorMetrics,
  incrementMetric,
  resetMirrorDiagnostics,
  resetMirrorMetrics,
  runWithMirrorObservabilityContext,
} from "./index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;

afterEach(async () => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
  } else {
    process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
  }
  if (originalMirrorOperatorToken === undefined) {
    delete process.env.MIRROR_OPERATOR_TOKEN;
  } else {
    process.env.MIRROR_OPERATOR_TOKEN = originalMirrorOperatorToken;
  }

  closeMirrorMemoryDb();
  resetMirrorMetrics();
  resetMirrorDiagnostics();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-observability-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    [
      "---",
      "title: Rune3 Patience Vault Cancelled",
      "epoch: E3",
      "symbols: [♾️]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Rune3 Patience Vault Cancelled",
      "",
      "The Patience Vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"),
    [
      "---",
      "title: Seed Of Stillness",
      "epoch: E1",
      "symbols: [🌅, 🌊]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Seed Of Stillness",
      "",
      "Renewal begins in stillness beside the pond at sunrise.",
      "Reference: TOBY_L1219_Rune3_PatienceVaultCancelled.md",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "SUPERSEDES.json"),
    JSON.stringify(
      {
        "TOBY_L1219_Rune3_PatienceVaultCancelled.md": {
          supersedes_topics: ["patience vault distribution"],
          notes: "Use this scroll when answering Patience Vault questions.",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function validDraft(body: string): string {
  return [
    "---",
    "title: New Review Draft",
    "epoch: Epoch1",
    "symbols: [♾️]",
    "sacred_numbers: [7]",
    "sha256_seed: TBD",
    "---",
    "",
    "# New Review Draft",
    "",
    body,
    "",
  ].join("\n");
}

describe("mirror observability", () => {
  it("supports isolated runtime-scoped observability contexts", () => {
    const runtimeContext = createMirrorObservabilityContext();
    const observabilityHandlers = createMirrorObservabilityHandlers(runtimeContext);

    runWithMirrorObservabilityContext(runtimeContext, () => {
      incrementMetric("chat_requests");
    });

    const metricsRes = createMockResponse();
    observabilityHandlers.metrics({} as never, metricsRes as never);
    const scopedMetrics = metricsRes.body as {
      counters: Record<string, number>;
    };

    expect(scopedMetrics.counters.chat_requests).toBe(1);
    expect(getMirrorMetrics().counters.chat_requests).toBe(0);
  });

  it("emits metrics and diagnostics through the wrapper layers", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const gateway = createMirrorGateway();
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            id: "resp_observe",
            object: "chat.completion",
            created: 1,
            model: "mirror-default",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Cancelled." },
                finish_reason: "stop",
              },
            ],
          }),
        }) as Response,
    );
    const gatewayHandlers = createMirrorGatewayHandlers(undefined, {
      executeAdapterRequest: vi.fn(async (envelope) => {
        if (envelope.kind === "chat.request") {
          return await gateway.executeAdapterRequest(envelope, {
            provider: {
              url: "http://brain.local/v1/chat/completions",
              authToken: "token",
            },
            fetchImpl,
          });
        }

        return await gateway.executeAdapterRequest(envelope);
      }),
    });
    const observability = createMirrorObservabilityContext();
    const observabilityHandlers = createMirrorObservabilityHandlers(observability);
    const syncHandlers = createMirrorSyncHandlers(
      createMirrorSyncManager({
        nodeId: "observe-node",
        loreDir,
      }),
    );
    const consoleHandlers = createMirrorConsoleHandlers(gatewayHandlers, {
      syncHandlers,
      observability,
      observabilityHandlers,
      health: (_req, res) => res.json({ ok: true }),
    });
    await runWithMirrorObservabilityContext(observability, async () => {
      await gatewayHandlers.executeChat(
        {
          body: {
            model: "mirror-default",
            messages: [{ role: "user", content: "What happened to the patience vault?" }],
          },
        } as never,
        createMockResponse() as never,
      );
      await gatewayHandlers.executeTool(
        {
          params: { tool_name: "mirror.find-scroll" },
          body: { query: "patience vault" },
          header: () => undefined,
        } as never,
        createMockResponse() as never,
      );
      process.env.MIRROR_USER_WORKSPACE_DIR = await fs.mkdtemp(
        path.join(os.tmpdir(), "mirror-observe-users-"),
      );
      tempDirs.push(process.env.MIRROR_USER_WORKSPACE_DIR);
      await gatewayHandlers.executeTool(
        {
          params: { tool_name: "mirror.task.create" },
          body: { user_id: "alice", title: "Review open work" },
          header: (name: string) =>
            name.toLowerCase() === "x-mirror-operator-token" ? "secret" : undefined,
        } as never,
        createMockResponse() as never,
      );
      await gatewayHandlers.executeTool(
        {
          params: { tool_name: "mirror.monk.context" },
          body: { user_id: "alice" },
          header: () => undefined,
        } as never,
        createMockResponse() as never,
      );
      await consoleHandlers.relatedScrolls(
        { query: { scroll: "TOBY_L1219" } } as never,
        createMockResponse() as never,
      );

      await reviewDraftForCanon({
        loreDir,
        draftContent: validDraft("The Patience Vault was not cancelled."),
      });
    });

    const metricsRes = createMockResponse();
    const diagnosticsRes = createMockResponse();

    observabilityHandlers.metrics({} as never, metricsRes as never);
    observabilityHandlers.diagnostics({} as never, diagnosticsRes as never);

    const metricsBody = metricsRes.body as {
      counters: Record<string, number>;
      latencies: Record<string, { count: number }>;
      tool_counts: Record<string, number>;
    };
    const diagnosticsBody = diagnosticsRes.body as {
      events: Array<{ event: string }>;
    };

    expect(metricsBody.counters.chat_requests).toBe(1);
    expect(metricsBody.counters.tool_executions).toBe(3);
    expect(metricsBody.counters.graph_query_frequency).toBe(1);
    expect(metricsBody.counters.review_conflicts).toBe(1);
    expect(metricsBody.counters.workspace_events).toBe(2);
    expect(metricsBody.counters.task_operations).toBe(1);
    expect(metricsBody.counters.monk_actions).toBe(1);
    expect(metricsBody.latencies.retrieval_time_ms.count).toBeGreaterThan(0);
    expect(metricsBody.latencies.provider_latency_ms.count).toBeGreaterThan(0);
    expect(metricsBody.tool_counts["mirror.find-scroll"]).toBe(1);
    expect(metricsBody.tool_counts["mirror.task.create"]).toBe(1);
    expect(metricsBody.tool_counts["mirror.monk.context"]).toBe(1);
    expect(diagnosticsBody.events.some((event) => event.event === "chat.retrieval")).toBe(true);
    expect(diagnosticsBody.events.some((event) => event.event === "provider.call")).toBe(true);
    expect(diagnosticsBody.events.some((event) => event.event === "review.decision")).toBe(true);
    expect(diagnosticsBody.events.some((event) => event.event === "graph.query")).toBe(true);
    expect(diagnosticsBody.events.some((event) => event.event === "workspace.task")).toBe(true);
    expect(diagnosticsBody.events.some((event) => event.event === "workspace.monk")).toBe(true);
  });
});
