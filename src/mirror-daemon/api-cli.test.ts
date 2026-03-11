import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMirrorApiCli } from "./api-cli.js";

vi.mock("./client.js", async () => {
  const actual = await vi.importActual<typeof import("./client.js")>("./client.js");
  return {
    ...actual,
    getPondManifest: vi.fn(async () => ({ pond_id: "toadaid-main" })),
    refreshPond: vi.fn(async () => ({ ok: true, path: "", pond: { pond_id: "toadaid-main" } })),
    listOceanPonds: vi.fn(async () => ({ count: 0, ponds: [] })),
    fetchOceanPond: vi.fn(async () => ({ success: true, pond: { pond_id: "toadaid-main" } })),
    updateOceanTrust: vi.fn(async () => ({ pond_id: "toadaid-main", trust_status: "known" })),
    consultOcean: vi.fn(async () => ({
      source_pond: "toadaid-main",
      source_url: "",
      fetched_at: "",
      signature_ok: true,
      payload: {},
    })),
    getOceanStatus: vi.fn(async () => ({
      local_pond_id: "toadaid-main",
      known_ponds_count: 0,
      trusted_ponds_count: 0,
      blocked_ponds_count: 0,
      handshakes: { successful_count: 0, last_success_at: null },
      consults: { successful_count: 0, last_success_at: null },
    })),
  };
});

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

  it("normalizes daemon-unavailable errors with a recovery hint", async () => {
    const mirror = new Command("mirror");
    registerMirrorApiCli(mirror);
    const clientMod = await import("./client.js");
    vi.mocked(clientMod.getPondManifest).mockRejectedValueOnce(
      new clientMod.MirrorDaemonClientError({
        message: "connect ECONNREFUSED",
        method: "GET",
        url: "http://127.0.0.1:8787/pond/manifest",
      }),
    );
    mirror.exitOverride();

    await expect(async () => {
      await mirror.parseAsync(["node", "mirror", "api", "pond", "manifest"]);
    }).rejects.toThrow(/openclaw mirror-daemon start/);
  });
});
