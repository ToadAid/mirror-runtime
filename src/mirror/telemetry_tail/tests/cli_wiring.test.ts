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
  return new Set(command.options.map((option) => option.long));
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
      expect.arrayContaining([
        "doctor",
        "status",
        "passport",
        "telemetry",
        "api",
        "journal",
        "runs",
        "ocean",
        "provider",
      ]),
    );

    const telemetry = getSubcommand(mirror, "telemetry");
    const journal = getSubcommand(mirror, "journal");
    const runs = getSubcommand(mirror, "runs");
    const ocean = getSubcommand(mirror, "ocean");
    const provider = getSubcommand(mirror, "provider");
    expect(telemetry).toBeDefined();
    expect(journal).toBeDefined();
    expect(runs).toBeDefined();
    expect(ocean).toBeDefined();
    expect(provider).toBeDefined();
    if (!telemetry || !journal || !runs || !ocean || !provider) {
      throw new Error("mirror telemetry command was not registered");
    }

    const telemetryNames = telemetry.commands.map((command) => command.name());
    expect(telemetryNames).toEqual(
      expect.arrayContaining(["tail", "replay", "index", "query", "reflect"]),
    );
    const journalNames = journal.commands.map((command) => command.name());
    expect(journalNames).toEqual(expect.arrayContaining(["tail"]));
    const runNames = runs.commands.map((command) => command.name());
    expect(runNames).toEqual(expect.arrayContaining(["list", "show"]));
    const oceanNames = ocean.commands.map((command) => command.name());
    expect(oceanNames).toEqual(expect.arrayContaining(["evidence"]));
    const providerNames = provider.commands.map((command) => command.name());
    expect(providerNames).toEqual(expect.arrayContaining(["status", "health"]));

    const doctor = getSubcommand(mirror, "doctor");
    const status = getSubcommand(mirror, "status");
    const tail = getSubcommand(telemetry, "tail");
    const journalTail = getSubcommand(journal, "tail");
    const runsList = getSubcommand(runs, "list");
    const runsShow = getSubcommand(runs, "show");
    const oceanEvidence = getSubcommand(ocean, "evidence");
    const providerStatus = getSubcommand(provider, "status");
    const providerHealth = getSubcommand(provider, "health");
    expect(doctor).toBeDefined();
    expect(status).toBeDefined();
    expect(tail).toBeDefined();
    expect(journalTail).toBeDefined();
    expect(runsList).toBeDefined();
    expect(runsShow).toBeDefined();
    expect(oceanEvidence).toBeDefined();
    expect(providerStatus).toBeDefined();
    expect(providerHealth).toBeDefined();
    if (
      !doctor ||
      !status ||
      !tail ||
      !journalTail ||
      !runsList ||
      !runsShow ||
      !oceanEvidence ||
      !providerStatus ||
      !providerHealth
    ) {
      throw new Error("expected mirror doctor/status/tail commands to be registered");
    }

    const doctorOptions = getLongOptionFlags(doctor);
    const statusOptions = getLongOptionFlags(status);
    const tailOptions = getLongOptionFlags(tail);
    const journalTailOptions = getLongOptionFlags(journalTail);
    const runsListOptions = getLongOptionFlags(runsList);
    const runsShowOptions = getLongOptionFlags(runsShow);
    const oceanEvidenceOptions = getLongOptionFlags(oceanEvidence);
    const providerStatusOptions = getLongOptionFlags(providerStatus);
    const providerHealthOptions = getLongOptionFlags(providerHealth);

    expect(doctorOptions.has("--json")).toBe(true);
    expect(statusOptions.has("--json")).toBe(true);
    expect(tailOptions.has("--json")).toBe(true);
    expect(tailOptions.has("--limit")).toBe(true);
    expect(journalTailOptions.has("--json")).toBe(true);
    expect(journalTailOptions.has("--limit")).toBe(true);
    expect(journalTailOptions.has("--type")).toBe(true);
    expect(journalTailOptions.has("--trace-id")).toBe(true);
    expect(runsListOptions.has("--limit")).toBe(true);
    expect(runsListOptions.has("--caller-agent")).toBe(true);
    expect(runsListOptions.has("--status")).toBe(true);
    expect(runsListOptions.has("--json")).toBe(true);
    expect(runsShowOptions.has("--json")).toBe(true);
    expect(oceanEvidenceOptions.has("--json")).toBe(true);
    expect(providerStatusOptions.has("--json")).toBe(true);
    expect(providerStatusOptions.has("--base-url")).toBe(true);
    expect(providerHealthOptions.has("--json")).toBe(true);
    expect(providerHealthOptions.has("--base-url")).toBe(true);
  });
});
