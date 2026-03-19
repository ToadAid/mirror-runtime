import { describe, expect, it, vi } from "vitest";
import { holdMirrorServiceUntilSignal } from "./mirror-entry.js";
import type { MirrorService } from "./mirror-service/index.js";

describe("mirror entry", () => {
  it("shuts down the running service on SIGTERM", async () => {
    const shutdown = vi.fn(async () => {});
    const promise = holdMirrorServiceUntilSignal({
      shutdown,
    } as unknown as MirrorService);

    process.emit("SIGTERM");
    await promise;

    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
