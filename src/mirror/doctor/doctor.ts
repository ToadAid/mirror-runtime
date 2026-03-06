import {
  runMirrorDoctorChecks,
  type MirrorDoctorCheck,
  type MirrorDoctorCheckOptions,
} from "./checks.js";

export type MirrorDoctorOverall = "GOOD" | "DEGRADED" | "BROKEN";

export type MirrorDoctorReport = {
  ts: string;
  overall: MirrorDoctorOverall;
  checks: MirrorDoctorCheck[];
};

export type RunMirrorDoctorOptions = MirrorDoctorCheckOptions & {
  now?: Date;
};

export function computeMirrorDoctorOverall(checks: MirrorDoctorCheck[]): MirrorDoctorOverall {
  if (checks.some((entry) => entry.status === "FAIL")) {
    return "BROKEN";
  }
  if (checks.some((entry) => entry.status === "WARN")) {
    return "DEGRADED";
  }
  return "GOOD";
}

export async function runMirrorDoctor(
  opts: RunMirrorDoctorOptions = {},
): Promise<MirrorDoctorReport> {
  const checks = await runMirrorDoctorChecks(opts);
  return {
    ts: (opts.now ?? new Date()).toISOString(),
    overall: computeMirrorDoctorOverall(checks),
    checks,
  };
}
