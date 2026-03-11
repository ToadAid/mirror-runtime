import { afterEach, describe, expect, it } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";
import { handleHealthEndpoint } from "./health.js";

describe("runtime health metadata resolution", () => {
  const priorEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in priorEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("uses injected metadata over env values", async () => {
    process.env.MIRROR_RUNTIME_MODE = "lan";
    process.env.MIRROR_RUNTIME_VERSION = "env-version";
    process.env.MIRROR_RUNTIME_COMMIT = "env-commit";

    const health = await handleHealthEndpoint(
      createNonExitingRuntime(),
      "http://brain.local/chat",
      "token",
      {
        mode: "intranet",
        version: "snapshot-version",
        commit: "snapshot-commit",
      },
    );

    expect(health.mode).toBe("intranet");
    expect(health.version).toBe("snapshot-version");
    expect(health.commit).toBe("snapshot-commit");
    expect(health.features).toEqual(["brain", "auth"]);
  });

  it("falls back to env metadata when snapshot metadata is absent", async () => {
    process.env.MIRROR_RUNTIME_MODE = "intranet";
    process.env.MIRROR_RUNTIME_VERSION = "env-version";
    process.env.MIRROR_RUNTIME_COMMIT = "env-commit";

    const health = await handleHealthEndpoint(createNonExitingRuntime(), undefined, undefined);

    expect(health.mode).toBe("intranet");
    expect(health.version).toBe("env-version");
    expect(health.commit).toBe("env-commit");
    expect(health.features).toEqual([]);
  });
});
