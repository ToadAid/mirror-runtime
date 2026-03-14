import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  registerSubCliByName,
  registerSubCliCommands,
} from "../../../cli/program/register.subclis.js";

function getSubcommand(parent: Command, name: string): Command | undefined {
  return parent.commands.find((command) => command.name() === name);
}

function getLongOptionFlags(command: Command): Set<string> {
  return new Set(
    command.options
      .map((option) => option.long)
      .filter((option): option is string => typeof option === "string"),
  );
}

describe("mirror cli wiring", () => {
  it("registers the active mirror command tree", async () => {
    const program = new Command();
    program.name("openclaw");

    registerSubCliCommands(program, ["node", "openclaw", "mirror"]);
    expect(program.commands.map((command) => command.name())).toEqual(["mirror"]);

    const registered = await registerSubCliByName(program, "mirror");
    expect(registered).toBe(true);

    const mirror = getSubcommand(program, "mirror");
    expect(mirror).toBeDefined();
    if (!mirror) {
      throw new Error("mirror command was not registered");
    }

    const mirrorNames = mirror.commands.map((command) => command.name());
    expect(mirrorNames).toEqual(
      expect.arrayContaining(["doctor", "status", "passport", "telemetry"]),
    );

    const telemetry = getSubcommand(mirror, "telemetry");
    expect(telemetry).toBeDefined();
    if (!telemetry) {
      throw new Error("mirror telemetry command was not registered");
    }

    const telemetryNames = telemetry.commands.map((command) => command.name());
    expect(telemetryNames).toEqual(
      expect.arrayContaining(["tail", "replay", "index", "query", "reflect"]),
    );

    const doctor = getSubcommand(mirror, "doctor");
    const status = getSubcommand(mirror, "status");
    const passport = getSubcommand(mirror, "passport");
    const tail = getSubcommand(telemetry, "tail");
    expect(doctor).toBeDefined();
    expect(status).toBeDefined();
    expect(passport).toBeDefined();
    expect(tail).toBeDefined();
    if (!doctor || !status || !passport || !tail) {
      throw new Error("expected mirror doctor/status/tail commands to be registered");
    }

    const doctorOptions = getLongOptionFlags(doctor);
    const statusOptions = getLongOptionFlags(status);
    const tailOptions = getLongOptionFlags(tail);

    expect(doctorOptions.has("--json")).toBe(true);
    expect(statusOptions.has("--json")).toBe(true);
    expect(tailOptions.has("--json")).toBe(true);
    expect(tailOptions.has("--limit")).toBe(true);
    expect(mirror.description()).toContain("compatibility");
    expect(doctor.description()).toContain("Compatibility-only");
    expect(status.description()).toContain("Compatibility wrapper");
    expect(passport.description()).toContain("Compatibility-only");
    expect(tail.description()).toContain("Compatibility-only");
  });
});
