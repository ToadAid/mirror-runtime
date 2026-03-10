import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerMirrorDaemonCli } from "./mirror-daemon-cli.js";

describe("registerMirrorDaemonCli", () => {
  it("registers mirror-daemon lifecycle commands", () => {
    const program = new Command();
    registerMirrorDaemonCli(program);

    const mirrorDaemon = program.commands.find((command) => command.name() === "mirror-daemon");
    expect(mirrorDaemon).toBeDefined();
    const runCommand = mirrorDaemon?.commands.find((command) => command.name() === "run");
    const startCommand = mirrorDaemon?.commands.find((command) => command.name() === "start");
    const stopCommand = mirrorDaemon?.commands.find((command) => command.name() === "stop");
    const statusCommand = mirrorDaemon?.commands.find((command) => command.name() === "status");
    expect(runCommand).toBeDefined();
    expect(startCommand).toBeDefined();
    expect(stopCommand).toBeDefined();
    expect(statusCommand).toBeDefined();
  });
});
