import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMirrorApiCli } from "./api-cli.js";

vi.mock("./client.js", () => ({
  getPondManifest: vi.fn(async () => ({ pond_id: "toadaid-main" })),
}));

describe("registerMirrorApiCli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers mirror api pond/ocean commands", () => {
    const mirror = new Command("mirror");
    registerMirrorApiCli(mirror);

    const api = mirror.commands.find((command) => command.name() === "api");
    expect(api).toBeDefined();
    const pond = api?.commands.find((command) => command.name() === "pond");
    const ocean = api?.commands.find((command) => command.name() === "ocean");
    expect(pond).toBeDefined();
    expect(ocean).toBeDefined();
    expect(pond?.commands.some((command) => command.name() === "manifest")).toBe(true);
    expect(pond?.commands.some((command) => command.name() === "refresh")).toBe(true);
    expect(ocean?.commands.some((command) => command.name() === "ponds")).toBe(true);
    expect(ocean?.commands.some((command) => command.name() === "fetch")).toBe(true);
    expect(ocean?.commands.some((command) => command.name() === "trust")).toBe(true);
    expect(ocean?.commands.some((command) => command.name() === "consult")).toBe(true);
    expect(ocean?.commands.some((command) => command.name() === "status")).toBe(true);
  });

  it("executes pond manifest command via mirror-daemon client", async () => {
    const mirror = new Command("mirror");
    registerMirrorApiCli(mirror);
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await mirror.parseAsync(["node", "mirror", "api", "pond", "manifest", "--json"]);
      const clientMod = await import("./client.js");
      expect(clientMod.getPondManifest).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledWith('{"pond_id":"toadaid-main"}\n');
    } finally {
      writeSpy.mockRestore();
    }
  });
});
