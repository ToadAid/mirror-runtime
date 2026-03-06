import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  registerSubCliByName,
  registerSubCliCommands,
} from "../../../cli/program/register.subclis.js";

const { formatMirrorDoctorHuman, runMirrorDoctor } = vi.hoisted(() => ({
  formatMirrorDoctorHuman: vi.fn(() => "doctor-human\n"),
  runMirrorDoctor: vi.fn(async () => ({
    ts: "2026-03-06T00:00:00.000Z",
    overall: "GOOD",
    checks: [],
  })),
}));

vi.mock("../index.js", () => ({
  formatMirrorDoctorHuman,
  runMirrorDoctor,
}));

const { runMirrorDoctorCli } = await import("../../telemetry_tail/cli.js");

function getSubcommand(parent: Command, name: string): Command | undefined {
  return parent.commands.find((command) => command.name() === name);
}

describe("mirror doctor cli wiring", () => {
  it("registers mirror doctor options from active mirror command tree", async () => {
    const program = new Command();
    registerSubCliCommands(program, ["node", "openclaw", "mirror"]);

    const registered = await registerSubCliByName(program, "mirror");
    expect(registered).toBe(true);

    const mirror = getSubcommand(program, "mirror");
    expect(mirror).toBeDefined();
    if (!mirror) {
      throw new Error("mirror command was not registered");
    }

    const doctor = getSubcommand(mirror, "doctor");
    expect(doctor).toBeDefined();
    if (!doctor) {
      throw new Error("mirror doctor command was not registered");
    }

    const longOptions = new Set(doctor.options.map((option) => option.long));
    expect(longOptions.has("--json")).toBe(true);
    expect(longOptions.has("--ndjson-path")).toBe(true);
    expect(longOptions.has("--db")).toBe(true);
  });

  it("passes json, ndjsonPath, and db to runMirrorDoctor", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    runMirrorDoctor.mockClear();

    await runMirrorDoctorCli({
      json: true,
      ndjsonPath: "/tmp/mirror.ndjson",
      db: "/tmp/mirror.sqlite",
    });

    expect(runMirrorDoctor).toHaveBeenCalledWith({
      ndjsonPath: "/tmp/mirror.ndjson",
      dbPath: "/tmp/mirror.sqlite",
    });
    expect(stdoutSpy).toHaveBeenCalledWith(
      `${JSON.stringify({
        ts: "2026-03-06T00:00:00.000Z",
        overall: "GOOD",
        checks: [],
      })}\n`,
    );
    stdoutSpy.mockRestore();
  });
});
