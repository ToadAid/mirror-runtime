/**
 * Memory / Mistake Ledger v1 — Tests
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMemoryEvent,
  listMemoryEvents,
  addMistakeEvent,
  listMistakeEvents,
  resolveMistake,
} from "../api.js";
import { closeLedger, getLedgerStats, initLedger, isLedgerEnabled } from "../db.js";

function createTempLedgerPath(): string {
  return path.join(
    os.tmpdir(),
    `test-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function hasLedgerNativeBindings(): boolean {
  const tempPath = createTempLedgerPath();
  try {
    initLedger({ path: tempPath });
    return true;
  } catch {
    return false;
  } finally {
    closeLedger();
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

const describeLedger = hasLedgerNativeBindings() ? describe : describe.skip;

describeLedger("Memory / Mistake Ledger v1 — Schema", () => {
  it("should create tables", () => {
    const tempPath = createTempLedgerPath();
    const db = initLedger({ path: tempPath });

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string;
    }>;
    const tableNames = tables.map((t: { name: string }) => t.name);

    expect(tableNames).toContain("memory_events");
    expect(tableNames).toContain("mistake_events");
    expect(tableNames).toContain("meta");

    closeLedger();
    fs.unlinkSync(tempPath);
  });

  it("should create indexes", () => {
    const tempPath = createTempLedgerPath();
    const db = initLedger({ path: tempPath });

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{
      name: string;
    }>;
    const indexNames = indexes.map((i: { name: string }) => i.name);

    expect(indexNames).toContain("idx_memory_ts");
    expect(indexNames).toContain("idx_memory_user");
    expect(indexNames).toContain("idx_mistake_resolved");
    expect(indexNames).toContain("idx_mistake_ts");

    closeLedger();
    fs.unlinkSync(tempPath);
  });
});

describeLedger("Memory / Mistake Ledger v1 — Memory Events", () => {
  let tempPath: string;

  beforeEach(() => {
    tempPath = createTempLedgerPath();
  });

  afterEach(() => {
    closeLedger();
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  });

  it("should add memory event", () => {
    const db = initLedger({ path: tempPath });
    const result = addMemoryEvent(db, {
      kind: "memory",
      key: "user_name",
      value_json: { name: "Alice" },
      source: "user",
    });

    expect(result.event_id).toBeDefined();
    expect(result.is_duplicate).toBe(false);
  });

  it("should list memory events", () => {
    const db = initLedger({ path: tempPath });

    addMemoryEvent(db, {
      kind: "memory",
      key: "key1",
      value_json: { value: 1 },
    });

    const events = listMemoryEvents(db);
    expect(events.length).toBe(1);
    expect(events[0].key).toBe("key1");
  });

  it("should filter memory events", () => {
    const db = initLedger({ path: tempPath });

    addMemoryEvent(db, {
      kind: "memory",
      key: "key1",
      value_json: {},
      user_id: "user123",
    });

    addMemoryEvent(db, {
      kind: "forget",
      key: "key2",
      value_json: {},
    });

    const events = listMemoryEvents(db, { kind: "memory" });
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe("memory");
    expect(events[0].user_id).toBe("user123");
  });
});

describeLedger("Memory / Mistake Ledger v1 — Mistake Events", () => {
  let tempPath: string;

  beforeEach(() => {
    tempPath = createTempLedgerPath();
  });

  afterEach(() => {
    closeLedger();
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  });

  it("should add mistake event", () => {
    const db = initLedger({ path: tempPath });
    const result = addMistakeEvent(db, {
      category: "tool_error",
      summary: "API timeout",
      severity: "high",
    });

    expect(result.event_id).toBeDefined();
    expect(result.is_duplicate).toBe(false);
  });

  it("should list mistake events", () => {
    const db = initLedger({ path: tempPath });

    addMistakeEvent(db, {
      category: "tool_error",
      summary: "Error 1",
      severity: "low",
    });

    const events = listMistakeEvents(db);
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("tool_error");
  });

  it("should filter mistake events", () => {
    const db = initLedger({ path: tempPath });

    addMistakeEvent(db, {
      category: "tool_error",
      summary: "Error 1",
      severity: "low",
    });

    addMistakeEvent(db, {
      category: "logic_error",
      summary: "Error 2",
      severity: "high",
    });

    const events = listMistakeEvents(db, { severity: "high" });
    expect(events.length).toBe(1);
    expect(events[0].severity).toBe("high");
  });

  it("should resolve mistake", () => {
    const db = initLedger({ path: tempPath });

    const result = addMistakeEvent(db, {
      category: "config_error",
      summary: "Config issue",
      severity: "medium",
    });

    const before = listMistakeEvents(db, { resolved: 0 });
    expect(before[0].resolved).toBe(0);

    resolveMistake(db, result.event_id, "Fixed in v1.2");

    const after = listMistakeEvents(db, { resolved: 0 });
    expect(after.length).toBe(0);

    const all = listMistakeEvents(db);
    const resolved = all.find((e) => e.id === result.event_id);
    expect(resolved?.resolved).toBe(1);
    expect(resolved?.notes).toBe("Fixed in v1.2");
  });
});

describeLedger("Memory / Mistake Ledger v1 — Stats", () => {
  let tempPath: string;

  beforeEach(() => {
    tempPath = createTempLedgerPath();
  });

  afterEach(() => {
    closeLedger();
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  });

  it("should return stats", () => {
    const db = initLedger({ path: tempPath });

    addMemoryEvent(db, {
      kind: "memory",
      key: "key1",
      value_json: {},
    });

    addMistakeEvent(db, {
      category: "tool_error",
      summary: "Error 1",
      severity: "low",
    });

    const stats = getLedgerStats();
    expect(stats.memory_count).toBe(1);
    expect(stats.mistake_count).toBe(1);
    expect(stats.unresolved_mistakes).toBe(1);
  });
});

describe("Memory / Mistake Ledger v1 — Disabled Mode", () => {
  it("should be disabled by default", () => {
    // Temporarily disable
    const original = process.env.MIRROR_LEDGER;
    delete process.env.MIRROR_LEDGER;

    expect(isLedgerEnabled()).toBe(false);

    // Restore
    if (original !== undefined) {
      process.env.MIRROR_LEDGER = original;
    } else {
      delete process.env.MIRROR_LEDGER;
    }
  });
});
