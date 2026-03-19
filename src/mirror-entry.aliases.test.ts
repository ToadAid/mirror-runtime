import { beforeEach, describe, expect, it, vi } from "vitest";

const runMirrorCli = vi.fn(async () => "");
const runMirrorWeb = vi.fn(async () => "Mirror Web UI: http://127.0.0.1:8787/mirror/ui/app\n");
const runMirrorOnboard = vi.fn(async () => "onboard\n");

vi.mock("./mirror-cli/index.js", () => ({
  runMirrorCli,
}));

vi.mock("./mirror-local/web.js", () => ({
  runMirrorWeb,
}));

vi.mock("./mirror-local/onboard.js", () => ({
  runMirrorOnboard,
}));

describe("mirror entry aliases", () => {
  beforeEach(() => {
    vi.resetModules();
    runMirrorCli.mockClear();
    runMirrorWeb.mockClear();
    runMirrorOnboard.mockClear();
  });

  it("maps mirror start to serve", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runMirrorEntry } = await import("./mirror-entry.js");

    try {
      await runMirrorEntry(["node", "mirror", "start", "--port", "0"]);
      expect(runMirrorCli).toHaveBeenCalledWith(
        ["serve", "--port", "0"],
        expect.objectContaining({
          onServiceStarted: expect.any(Function),
        }),
      );
    } finally {
      stdout.mockRestore();
    }
  });

  it("maps mirror console to web", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runMirrorEntry } = await import("./mirror-entry.js");

    try {
      await runMirrorEntry(["node", "mirror", "console", "--no-open"]);
      expect(runMirrorWeb).toHaveBeenCalledWith({ openBrowser: false });
    } finally {
      stdout.mockRestore();
    }
  });
});
