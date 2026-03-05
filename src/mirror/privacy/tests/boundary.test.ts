import { describe, expect, it } from "vitest";
import { sanitizeTelemetryEvent } from "../boundary.js";

describe("privacy boundary sanitizer", () => {
  it("removes human-identifiable fields while preserving agent identity fields", () => {
    const input = {
      runId: "0xabc",
      humanName: "Tommy",
      email: "x@y.com",
      nudges: ["hello"],
    };

    const output = sanitizeTelemetryEvent(input) as Record<string, unknown>;

    expect(output).not.toHaveProperty("humanName");
    expect(output).not.toHaveProperty("email");
    expect(output).toMatchObject({
      runId: "0xabc",
      nudges: ["hello"],
    });
  });
});
