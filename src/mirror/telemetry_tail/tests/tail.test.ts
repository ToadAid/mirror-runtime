import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tailMirrorTelemetry } from "../tail.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function withTempFile(fileName: string): Promise<{ dir: string; filePath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-tail-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, fileName);
  return { dir, filePath };
}

async function waitFor(check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for condition");
}

describe("tailMirrorTelemetry", () => {
  it("prints last backlog mirror.nudge events in once mode", async () => {
    const { filePath } = await withTempFile("telemetry.ndjson");
    const lines = [
      JSON.stringify({ foo: "ignore" }),
      JSON.stringify({ type: "mirror.nudge", runId: "run-1", nudges: ["n1"], ts: 1 }),
      JSON.stringify({ type: "mirror.nudge", runId: "run-2", nudges: ["n2"], ts: 2 }),
      JSON.stringify({ type: "mirror.nudge", runId: "run-3", nudges: ["n3"], ts: 3 }),
    ];
    await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");

    const output: string[] = [];
    await tailMirrorTelemetry({
      path: filePath,
      once: true,
      limit: 2,
      write: (text) => output.push(text),
      warn: () => {},
    });

    const joined = output.join("");
    expect(joined).toContain("runId: run-2");
    expect(joined).toContain("runId: run-3");
    expect(joined).not.toContain("runId: run-1");
  });

  it("follows appended events until aborted", async () => {
    const { filePath } = await withTempFile("telemetry-follow.ndjson");
    await fs.writeFile(filePath, "", "utf8");

    const output: string[] = [];
    const controller = new AbortController();
    const tailPromise = tailMirrorTelemetry({
      path: filePath,
      limit: 0,
      pollMs: 10,
      signal: controller.signal,
      write: (text) => output.push(text),
      warn: () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 40));
    await fs.appendFile(
      filePath,
      `${JSON.stringify({ type: "mirror.nudge", runId: "run-follow", nudges: ["hello"], ts: 7 })}\n`,
      "utf8",
    );

    await waitFor(() => output.join("").includes("runId: run-follow"));
    controller.abort();
    await tailPromise;

    expect(output.join("")).toContain("🪞 mirror.nudge");
    expect(output.join("")).toContain("runId: run-follow");
  });
});
