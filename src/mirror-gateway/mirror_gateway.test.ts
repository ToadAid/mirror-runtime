import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorPolicyEngine } from "../mirror-policy/index.js";
import { createMirrorGatewayHandlers } from "./index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;
const originalMirrorUserWorkspaceDir = process.env.MIRROR_USER_WORKSPACE_DIR;

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
  if (originalMirrorUserWorkspaceDir === undefined) {
    delete process.env.MIRROR_USER_WORKSPACE_DIR;
  } else {
    process.env.MIRROR_USER_WORKSPACE_DIR = originalMirrorUserWorkspaceDir;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-"));
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
      "# Rune3",
      "",
      "The Patience Vault was cancelled.",
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
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# Updates\n", "utf8");
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

function createRequest(
  params: Record<string, string>,
  body: Record<string, unknown>,
  token?: string,
) {
  return {
    params,
    body,
    header(name: string) {
      if (name.toLowerCase() === "x-mirror-operator-token") {
        return token;
      }
      return undefined;
    },
  };
}

describe("mirror gateway", () => {
  it("lists tools from the Mirror-owned gateway surface", () => {
    const handlers = createMirrorGatewayHandlers();
    const res = createMockResponse();

    handlers.listTools({} as never, res as never);
    const body = res.body as { tools: Array<{ metadata: { name: string } }> };

    expect(res.statusCode).toBe(200);
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.commit-scroll");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.interpret-tweet");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.task.create");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.reminder.due");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.heartbeat.evaluate");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.monk.context");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.monk.note");
  });

  it("executes a read tool", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const handlers = createMirrorGatewayHandlers();
    const res = createMockResponse();

    await handlers.executeTool(
      createRequest({ tool_name: "mirror.find-scroll" }, { query: "patience vault" }) as never,
      res as never,
    );

    const body = res.body as { tool: string; result: { candidates: Array<{ path: string }> } };
    expect(res.statusCode).toBe(200);
    expect(body.tool).toBe("mirror.find-scroll");
    expect(body.result.candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
  });

  it("blocks unauthorized write tools", async () => {
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const handlers = createMirrorGatewayHandlers();
    const res = createMockResponse();

    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.forge-scroll" },
        { title: "New Scroll", category: "L", narrative: "Renewal begins." },
      ) as never,
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "Mirror operator authorization required",
      code: "operator_auth_required",
    });
  });

  it("applies policy evaluation at chat ingress", async () => {
    const handlers = createMirrorGatewayHandlers(undefined, {
      provider: {
        url: "https://provider.example",
        authToken: "token",
      },
      policy: createMirrorPolicyEngine([
        {
          name: "deny.chat",
          evaluate(input) {
            if (input.target.kind !== "chat") {
              return null;
            }
            return {
              allowed: false,
              code: "chat_blocked",
              reason: "Chat blocked by test policy",
              statusCode: 451,
              rule: "deny.chat",
            };
          },
        },
      ]),
    });
    const res = createMockResponse();

    await handlers.executeChat(
      createRequest(
        {},
        {
          model: "mirror-model",
          messages: [{ role: "user", content: "hello" }],
        },
      ) as never,
      res as never,
    );

    expect(res.statusCode).toBe(451);
    expect(res.body).toEqual({
      error: "Chat blocked by test policy",
      code: "chat_blocked",
    });
  });

  it("routes personal utility tools without touching canon", async () => {
    const loreDir = await createTempLoreDir();
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-users-"));
    tempDirs.push(usersRoot);
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    const canonBefore = await fs.readFile(
      path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
      "utf8",
    );
    const handlers = createMirrorGatewayHandlers();

    const createTaskRes = createMockResponse();
    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.task.create" },
        { user_id: "alice", title: "Daily planning" },
      ) as never,
      createTaskRes as never,
    );
    expect(createTaskRes.statusCode).toBe(200);

    const dueReminderRes = createMockResponse();
    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.reminder.due" },
        { user_id: "alice", now: "2026-03-13T09:00:00.000Z" },
      ) as never,
      dueReminderRes as never,
    );
    expect(dueReminderRes.statusCode).toBe(200);

    const heartbeatRes = createMockResponse();
    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.heartbeat.evaluate" },
        { user_id: "alice", now: "2026-03-13T09:00:00.000Z" },
      ) as never,
      heartbeatRes as never,
    );
    expect(heartbeatRes.statusCode).toBe(200);

    const monkRes = createMockResponse();
    await handlers.executeTool(
      createRequest({ tool_name: "mirror.monk.context" }, { user_id: "alice" }) as never,
      monkRes as never,
    );
    expect(monkRes.statusCode).toBe(200);

    const canonAfter = await fs.readFile(
      path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
      "utf8",
    );
    expect(canonAfter).toBe(canonBefore);
  });
});
