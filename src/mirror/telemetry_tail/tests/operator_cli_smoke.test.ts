import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../mirror-daemon/client.js", async () => {
  const actual = await vi.importActual<typeof import("../../../mirror-daemon/client.js")>(
    "../../../mirror-daemon/client.js",
  );
  return {
    ...actual,
    listMirrorRuns: vi.fn(async () => ({
      count: 1,
      total: 1,
      order: "newest-first",
      runs: [
        {
          run_id: "t-1",
          trace_id: "t-1",
          caller_agent: "agent0",
          started_at: "2026-03-10T00:00:00.000Z",
          ended_at: "2026-03-10T00:00:01.000Z",
          tool_count: 1,
          approval_count: 1,
          status: "completed",
          last_event_type: "tool.executed",
        },
      ],
    })),
    getMirrorRun: vi.fn(async () => ({
      summary: {
        run_id: "t-1",
        trace_id: "t-1",
        caller_agent: "agent0",
        started_at: "2026-03-10T00:00:00.000Z",
        ended_at: "2026-03-10T00:00:01.000Z",
        tool_count: 1,
        approval_count: 1,
        status: "completed",
        last_event_type: "tool.executed",
      },
      order: "oldest-first",
      events: [{ ts: "2026-03-10T00:00:01.000Z", event_type: "tool.executed", trace_id: "t-1" }],
    })),
    getOceanEvidence: vi.fn(async () => ({
      pond_id: "pond-a",
      trust_status: "trusted",
      signature_ok: true,
    })),
    getMirrorProviderStatus: vi.fn(async () => ({
      provider: "brain-chat",
      default_model: "gpt-4o-mini",
      source: { runtime_snapshot: true },
      provider_env: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      adapter: "brain-chat",
    })),
    getMirrorProviderHealth: vi.fn(async () => ({
      provider: "brain-chat",
      model: "gpt-4o-mini",
      configured: true,
      reachable: true,
      ok: true,
      source: { runtime_snapshot: true },
    })),
    listMirrorJournal: vi.fn(async () => ({
      count: 1,
      order: "newest-first",
      entries: [
        {
          ts: "2026-03-10T00:00:01.000Z",
          event_type: "tool.executed",
          trace_id: "t-1",
          tool_name: "echo",
          reason: "ok",
        },
      ],
    })),
  };
});

import {
  MirrorDaemonClientError,
  getMirrorRun,
  getMirrorProviderStatus,
  getMirrorProviderHealth,
  getOceanEvidence,
  listMirrorJournal,
  listMirrorRuns,
} from "../../../mirror-daemon/client.js";
import { registerMirrorTelemetryCli } from "../cli.js";

describe("mirror operator cli smoke", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs `mirror runs list` via mirror-daemon client", async () => {
    const program = new Command("openclaw");
    registerMirrorTelemetryCli(program);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await program.parseAsync(["node", "openclaw", "mirror", "runs", "list", "--json"]);
      expect(listMirrorRuns).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"trace_id":"t-1"'));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("runs `mirror journal tail` in json and human modes", async () => {
    const program = new Command("openclaw");
    registerMirrorTelemetryCli(program);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await program.parseAsync([
        "node",
        "openclaw",
        "mirror",
        "journal",
        "tail",
        "--limit",
        "5",
        "--type",
        "tool.executed",
        "--trace-id",
        "t-1",
        "--json",
      ]);
      expect(listMirrorJournal).toHaveBeenCalledWith(
        { limit: 5, type: "tool.executed", traceId: "t-1" },
        { baseUrl: undefined },
      );
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"entries"'));

      writeSpy.mockClear();
      await program.parseAsync(["node", "openclaw", "mirror", "journal", "tail"]);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("tool.executed"));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("runs `mirror runs show` and `mirror ocean evidence`", async () => {
    const program = new Command("openclaw");
    registerMirrorTelemetryCli(program);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await program.parseAsync(["node", "openclaw", "mirror", "runs", "show", "t-1", "--json"]);
      await program.parseAsync([
        "node",
        "openclaw",
        "mirror",
        "ocean",
        "evidence",
        "pond-a",
        "--json",
      ]);
      expect(getMirrorRun).toHaveBeenCalledWith("t-1", { baseUrl: undefined });
      expect(getOceanEvidence).toHaveBeenCalledWith("pond-a", { baseUrl: undefined });
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"pond_id":"pond-a"'));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("runs `mirror provider status` in json and human modes", async () => {
    const program = new Command("openclaw");
    registerMirrorTelemetryCli(program);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await program.parseAsync(["node", "openclaw", "mirror", "provider", "status", "--json"]);
      expect(getMirrorProviderStatus).toHaveBeenCalledWith({ baseUrl: undefined });
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"provider":"brain-chat"'));

      writeSpy.mockClear();
      await program.parseAsync(["node", "openclaw", "mirror", "provider", "status"]);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("provider: brain-chat"));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("runs `mirror provider health` in json and human modes", async () => {
    const program = new Command("openclaw");
    registerMirrorTelemetryCli(program);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await program.parseAsync(["node", "openclaw", "mirror", "provider", "health", "--json"]);
      expect(getMirrorProviderHealth).toHaveBeenCalledWith({ baseUrl: undefined });
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"reachable":true'));

      writeSpy.mockClear();
      await program.parseAsync(["node", "openclaw", "mirror", "provider", "health"]);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("configured: true"));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("returns a clean auth/unavailable error message", async () => {
    vi.mocked(listMirrorRuns).mockRejectedValueOnce(
      new MirrorDaemonClientError({
        message: "unauthorized",
        status: 401,
        method: "GET",
        url: "http://127.0.0.1:8787/mirror/runs",
      }),
    );

    await expect(async () => {
      await runWithExitOverride(["node", "openclaw", "mirror", "runs", "list"]);
    }).rejects.toThrow(/Hint: set MIRROR_DAEMON_TOKEN/);

    vi.mocked(listMirrorRuns).mockRejectedValueOnce(
      new MirrorDaemonClientError({
        message: "connect ECONNREFUSED",
        method: "GET",
        url: "http://127.0.0.1:8787/mirror/runs",
      }),
    );
    await expect(async () => {
      await runWithExitOverride(["node", "openclaw", "mirror", "runs", "list"]);
    }).rejects.toThrow(/openclaw mirror-daemon start/);

    vi.mocked(listMirrorJournal).mockRejectedValueOnce(
      new MirrorDaemonClientError({
        message: "connect ECONNREFUSED",
        method: "GET",
        url: "http://127.0.0.1:8787/mirror/journal",
      }),
    );
    await expect(async () => {
      await runWithExitOverride(["node", "openclaw", "mirror", "journal", "tail"]);
    }).rejects.toThrow(/openclaw mirror-daemon start/);
  });

  it("preserves specific 404 text for run/pond resources", async () => {
    vi.mocked(getMirrorRun).mockRejectedValueOnce(
      new MirrorDaemonClientError({
        message: "unknown run id: missing-run",
        status: 404,
        method: "GET",
        url: "http://127.0.0.1:8787/mirror/runs/missing-run",
      }),
    );
    await expect(async () => {
      await runWithExitOverride(["node", "openclaw", "mirror", "runs", "show", "missing-run"]);
    }).rejects.toThrow(/unknown run id: missing-run/);

    vi.mocked(getOceanEvidence).mockRejectedValueOnce(
      new MirrorDaemonClientError({
        message: "unknown pond_id: missing-pond",
        status: 404,
        method: "GET",
        url: "http://127.0.0.1:8787/ocean/ponds/missing-pond/evidence",
      }),
    );
    await expect(async () => {
      await runWithExitOverride([
        "node",
        "openclaw",
        "mirror",
        "ocean",
        "evidence",
        "missing-pond",
      ]);
    }).rejects.toThrow(/unknown pond_id: missing-pond/);
  });
});

async function runWithExitOverride(argv: string[]): Promise<void> {
  const program = new Command("openclaw");
  registerMirrorTelemetryCli(program);
  program.exitOverride();
  await program.parseAsync(argv);
}
