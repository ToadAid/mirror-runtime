import fs from "node:fs";
import readline from "node:readline";
import { openTelemetryIndexDb } from "./db.js";

export type IndexTelemetryFileOptions = {
  sourcePath: string;
  dbPath?: string;
  rebuild?: boolean;
};

type ParsedIndexedEvent = {
  ts: number;
  type: string;
  runId?: string;
  payloadJson: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIndexedEvent(rawLine: string): ParsedIndexedEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawLine) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const envelope =
    typeof parsed.stream === "string" && isRecord(parsed.data)
      ? (parsed as { stream: string; data: Record<string, unknown> })
      : null;

  const data = envelope?.stream === "telemetry" ? envelope.data : parsed;
  if (!isRecord(data)) {
    return null;
  }

  const ts = data.ts;
  const type = data.type;
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return null;
  }
  if (typeof type !== "string" || !type.trim()) {
    return null;
  }

  const runId = typeof data.runId === "string" ? data.runId : undefined;
  return {
    ts,
    type,
    runId,
    payloadJson: JSON.stringify(parsed),
  };
}

export async function indexTelemetryFile(options: IndexTelemetryFileOptions): Promise<number> {
  const db = openTelemetryIndexDb({
    dbPath: options.dbPath,
    rebuild: options.rebuild,
  });

  const seen = new Set<string>();
  const insert = db.prepare(
    "INSERT INTO events(ts, type, run_id, payload_json) VALUES (?, ?, ?, ?)",
  );

  const sourceStream = fs.createReadStream(options.sourcePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: sourceStream,
    crlfDelay: Infinity,
  });

  let inserted = 0;
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = parseIndexedEvent(trimmed);
      if (!parsed) {
        continue;
      }
      if (seen.has(parsed.payloadJson)) {
        continue;
      }
      seen.add(parsed.payloadJson);
      insert.run(parsed.ts, parsed.type, parsed.runId ?? null, parsed.payloadJson);
      inserted += 1;
    }
  } finally {
    rl.close();
    sourceStream.destroy();
    db.close();
  }

  return inserted;
}
