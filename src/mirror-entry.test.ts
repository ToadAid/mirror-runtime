import { afterEach, describe, expect, it, vi } from "vitest";
import { runMirrorEntry } from "./mirror-entry.js";

describe("mirror standalone entry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints help when invoked without a command", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await runMirrorEntry(["node", "mirror"]);

    expect(code).toBe(0);
    expect(writeSpy).toHaveBeenCalled();
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("Mirror Runtime");
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain(
      "status    Show the standalone Mirror runtime status snapshot.",
    );
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain(
      "verify-lore Verify canonical lore files against a lore manifest.",
    );
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("serve     Start the Mirror service");
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain(
      "sync      Operate the standalone Mirror sync surface",
    );
  });

  it("prints command-specific help", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await runMirrorEntry(["node", "mirror", "help", "commit"]);

    expect(code).toBe(0);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("mirror commit");
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--operator-token <token>");
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--json");
  });

  it("prints utility command help", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await runMirrorEntry(["node", "mirror", "help", "task"]);

    expect(code).toBe(0);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain(
      "mirror task <create|list|update|complete|delete>",
    );
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--user-id <id>");
  });

  it("prints monk command help", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await runMirrorEntry(["node", "mirror", "help", "monk"]);

    expect(code).toBe(0);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain(
      "mirror monk <context|next|open-work|reminders|resume|followup-task|followup-reminder|note|record-action>",
    );
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--note <text>");
  });

  it("prints status and verify-lore command help", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const statusCode = await runMirrorEntry(["node", "mirror", "help", "status"]);
    expect(statusCode).toBe(0);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("mirror status");
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--ndjson-path <path>");

    writeSpy.mockClear();

    const verifyCode = await runMirrorEntry(["node", "mirror", "help", "verify-lore"]);
    expect(verifyCode).toBe(0);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("mirror verify-lore");
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--manifest <path>");
  });

  it("prints sync command help", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await runMirrorEntry(["node", "mirror", "help", "sync"]);

    expect(code).toBe(0);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain(
      "mirror sync <peers|updates|announce|pull>",
    );
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("--service-url <url>");
  });
});
