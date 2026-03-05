import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rotateIfNeeded } from "../rotate.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function mkTempFile(name: string, content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-telemetry-rotate-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

describe("rotateIfNeeded", () => {
  it("does not rotate under threshold", async () => {
    const filePath = await mkTempFile("sink.ndjson", "abc");

    rotateIfNeeded(filePath, 10, 5);

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.1`)).toBe(false);
  });

  it("rotates at or over threshold", async () => {
    const filePath = await mkTempFile("sink.ndjson", "12345");

    rotateIfNeeded(filePath, 5, 5);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}.1`)).toBe(true);
    const rotated = await fs.readFile(`${filePath}.1`, "utf8");
    expect(rotated).toBe("12345");
  });

  it("enforces keep count and prunes keep+1", async () => {
    const filePath = await mkTempFile("sink.ndjson", "base");
    await fs.writeFile(`${filePath}.1`, "one", "utf8");
    await fs.writeFile(`${filePath}.2`, "two", "utf8");
    await fs.writeFile(`${filePath}.3`, "three", "utf8");

    rotateIfNeeded(filePath, 1, 2);

    expect(existsSync(`${filePath}.4`)).toBe(false);
    expect(await fs.readFile(`${filePath}.3`, "utf8")).toBe("two");
    expect(await fs.readFile(`${filePath}.2`, "utf8")).toBe("one");
    expect(await fs.readFile(`${filePath}.1`, "utf8")).toBe("base");
  });

  it("shifts history correctly across repeated rotations", async () => {
    const filePath = await mkTempFile("sink.ndjson", "a");

    rotateIfNeeded(filePath, 1, 3);
    await fs.writeFile(filePath, "b", "utf8");
    rotateIfNeeded(filePath, 1, 3);
    await fs.writeFile(filePath, "c", "utf8");
    rotateIfNeeded(filePath, 1, 3);

    expect(await fs.readFile(`${filePath}.1`, "utf8")).toBe("c");
    expect(await fs.readFile(`${filePath}.2`, "utf8")).toBe("b");
    expect(await fs.readFile(`${filePath}.3`, "utf8")).toBe("a");
  });
});
