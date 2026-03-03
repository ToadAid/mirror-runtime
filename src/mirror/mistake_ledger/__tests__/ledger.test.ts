/**
 * Memory / Mistake Ledger v1 — Tests
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { initSchema } from "../schema.js";
import { Ledger, getLedger } from "../ledger.js";
import { redact } from "../redact.js";

describe("MistakeLedger", () => {
  let testDbPath: string;
  let testDb: Database.Database;

  beforeEach(() => {
    testDbPath = `/tmp/test-ledger-${Date.now()}.sqlite`;
    testDb = new Database(testDbPath);
    initSchema(testDb);
  });

  afterEach(() => {
    testDb.close();
    fs.unlinkSync(testDbPath);
  });

  it("should create ledger instance", () => {
    const ledger = new Ledger({
      enabled: true,
      path: testDbPath,
    });
    assert.ok(ledger);
    ledger.close();
  });

  it("should record an event", () => {
    const ledger = new Ledger({
      enabled: true,
      path: testDbPath,
    });

    const result = ledger.record({
      kind: "memory",
      title: "test_memory",
      detail: { key: "value" },
    });

    assert.ok(result);
    assert.ok(result.id);

    ledger.close();
  });

  it("should query recorded events", () => {
    const ledger = new Ledger({
      enabled: true,
      path: testDbPath,
    });

    ledger.record({
      kind: "memory",
      title: "test_memory_1",
      detail: { key: "value1" },
    });

    ledger.record({
      kind: "mistake",
      title: "test_mistake",
      detail: { error: "test error" },
    });

    const events = ledger.query({ kind: "memory", limit: 10 });

    assert.ok(events.length >= 1);
    assert.strictEqual(events[0].kind, "memory");

    ledger.close();
  });

  it("should deduplicate by hash", () => {
    const ledger = new Ledger({
      enabled: true,
      path: testDbPath,
    });

    const input1 = {
      kind: "decision",
      title: "duplicate_test",
      detail: { key: "value" },
    };

    const input2 = {
      kind: "decision",
      title: "duplicate_test",
      detail: { key: "value" },
    };

    const result1 = ledger.record(input1);
    const result2 = ledger.record(input2);

    assert.ok(result1);
    assert.ok(result2);

    // Both should have same hash
    assert.strictEqual(result1?.id, result2?.id);

    ledger.close();
  });

  it("should redact sensitive data", () => {
    const result = redact(
      {
        api_key: "secret123",
        password: "pass456",
        normal: "value",
        nested: { token: "tok789" },
      },
      { enabled: true },
    );

    assert.strictEqual(result.api_key, "[REDACTED]");
    assert.strictEqual(result.password, "[REDACTED]");
    assert.strictEqual(result.normal, "value");
    assert.strictEqual(result.nested.token, "[REDACTED]");
  });

  it("should disable redaction when requested", () => {
    const result = redact(
      {
        api_key: "secret123",
      },
      { enabled: false },
    );

    assert.strictEqual(result.api_key, "secret123");
  });

  it("should respect enabled flag", () => {
    const ledger = new Ledger({
      enabled: false,
      path: testDbPath,
    });

    const result = ledger.record({
      kind: "memory",
      title: "test",
      detail: {},
    });

    assert.strictEqual(result, null);

    const events = ledger.query({ limit: 10 });
    assert.strictEqual(events.length, 0);

    ledger.close();
  });

  it("should return health status", () => {
    const ledger = new Ledger({
      enabled: true,
      path: testDbPath,
    });

    const health = ledger.health();

    assert.ok(health.ok);
    assert.ok(health.path);
    assert.strictEqual(health.enabled, true);

    ledger.close();
  });

  it("should query with filters", () => {
    const ledger = new Ledger({
      enabled: true,
      path: testDbPath,
    });

    ledger.record({
      kind: "memory",
      title: "filter_test_1",
      source: "user",
      detail: {},
    });

    ledger.record({
      kind: "mistake",
      title: "filter_test_2",
      source: "agent",
      detail: {},
    });

    const memoryEvents = ledger.query({ kind: "memory" });
    assert.ok(memoryEvents.length >= 1);

    const agentEvents = ledger.query({ source: "agent" });
    assert.ok(agentEvents.length >= 1);

    ledger.close();
  });
});