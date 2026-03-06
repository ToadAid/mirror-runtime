import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  registerSubCliByName,
  registerSubCliCommands,
} from "../../../cli/program/register.subclis.js";

describe("mirror doctor cli wiring", () => {
  it("registers mirror doctor under the active mirror command tree", async () => {
    const program = new Command();
    registerSubCliCommands(program, ["node", "openclaw", "mirror"]);

    const registered = await registerSubCliByName(program, "mirror");
    expect(registered).toBe(true);

    const mirror = program.commands.find((command) => command.name() === "mirror");
    expect(mirror).toBeDefined();
    if (!mirror) {
      throw new Error("mirror command was not registered");
    }

    const doctor = mirror.commands.find((command) => command.name() === "doctor");
    expect(doctor).toBeDefined();
    if (!doctor) {
      throw new Error("mirror doctor command was not registered");
    }

    const longOptions = new Set(doctor.options.map((option) => option.long));
    expect(longOptions.has("--json")).toBe(true);
  });
});
