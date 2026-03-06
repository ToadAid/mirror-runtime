import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteBackend, isBetterSqlite3Available, type LedgerBackend } from "../db.js";
import { Ledger } from "../ledger.js";
import { redact } from "../redact.js";
import type { LedgerEventRow, LedgerQuery } from "../types.js";

class MockBackend implements LedgerBackend {
  private readonly events: LedgerEventRow[] = [];

  insert(event: LedgerEventRow): void {
    this.events.push(event);
  }

  query(query: LedgerQuery): LedgerEventRow[] {
    let rows = [...this.events];

    if (query.kind) {
      rows = rows.filter((row) => row.kind === query.kind);
    }
    if (query.runId) {
      rows = rows.filter((row) => row.run_id === query.runId);
    }
    if (query.toolName) {
      rows = rows.filter((row) => row.tool_name === query.toolName);
    }
    if (query.source) {
      rows = rows.filter((row) => row.source === query.source);
    }
    if (query.sinceTs !== undefined) {
      const sinceTs = query.sinceTs;
      rows = rows.filter((row) => row.ts >= sinceTs);
    }
    if (query.untilTs !== undefined) {
      const untilTs = query.untilTs;
      rows = rows.filter((row) => row.ts <= untilTs);
    }

    rows.sort((a, b) => b.ts - a.ts);
    return rows.slice(0, query.limit ?? 50);
  }

  health(): { path: string; version: number; ok: boolean } {
    return { path: "mock://ledger", version: 1, ok: true };
  }

  close(): void {
    // no-op
  }
}

function createMockLedger(enabled = true): Ledger {
  return new Ledger(
    { enabled },
    {
      createBackend: () => new MockBackend(),
    },
  );
}

describe("mistake_ledger", () => {
  let dbPath = "";

  beforeEach(() => {
    dbPath = path.join(
      "/tmp",
      `test-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );
  });

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it("records and queries events with mock backend", () => {
    const ledger = createMockLedger(true);

    const first = ledger.record({
      kind: "memory",
      title: "test_memory",
      detail: { key: "value" },
      source: "user",
    });
    const second = ledger.record({
      kind: "mistake",
      title: "tool_fail",
      detail: { error: "boom" },
      source: "agent",
    });

    expect(first?.id).toBeTruthy();
    expect(second?.id).toBeTruthy();

    const memoryOnly = ledger.query({ kind: "memory", limit: 10 });
    expect(memoryOnly.length).toBe(1);
    expect(memoryOnly[0]?.title).toBe("test_memory");

    const agentOnly = ledger.query({ source: "agent", limit: 10 });
    expect(agentOnly.length).toBe(1);
    expect(agentOnly[0]?.title).toBe("tool_fail");

    ledger.close();
  });

  it("respects disabled mode", () => {
    const ledger = createMockLedger(false);

    const result = ledger.record({ kind: "memory", title: "noop", detail: {} });
    expect(result).toBeNull();
    expect(ledger.query({ limit: 10 })).toEqual([]);

    ledger.close();
  });

  it("redacts sensitive data", () => {
    const out = redact(
      {
        api_key: "secret123",
        nested: { token: "tok789" },
        normal: "ok",
      },
      { enabled: true },
    );

    expect(out.api_key).toBe("[REDACTED]");
    expect((out.nested as { token: string }).token).toBe("[REDACTED]");
    expect(out.normal).toBe("ok");
  });

  it("returns health metadata from backend", () => {
    const ledger = createMockLedger(true);
    const health = ledger.health();

    expect(health.ok).toBe(true);
    expect(health.enabled).toBe(true);
    expect(health.path).toBe("mock://ledger");
    expect(health.version).toBe(1);

    ledger.close();
  });

  it.skipIf(!isBetterSqlite3Available())("integration: sqlite backend records and queries", () => {
    const ledger = new Ledger(
      { enabled: true, path: dbPath },
      { createBackend: (options) => createSqliteBackend({ path: options.path }) },
    );

    const result = ledger.record({
      kind: "mistake",
      title: "integration",
      detail: { api_key: "secret" },
      source: "system",
    });

    expect(result?.id).toBeTruthy();

    const rows = ledger.query({ kind: "mistake", limit: 5 });
    expect(rows.length).toBe(1);
    expect(rows[0]?.title).toBe("integration");
    expect(rows[0]?.detail_json).toContain("[REDACTED]");

    const health = ledger.health();
    expect(health.ok).toBe(true);
    expect(health.path).toContain("test-ledger-");

    ledger.close();
  });
});
