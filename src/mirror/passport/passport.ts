import os from "node:os";
import process from "node:process";
import type { BuildMirrorPassportOptions, MirrorPassport } from "./types.js";

function getTrimmed(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key]?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

function resolveAgentId(env: NodeJS.ProcessEnv): string {
  return (
    getTrimmed(env, "MIRROR_AGENT_ID") ??
    getTrimmed(env, "OPENCLAW_AGENT_ID") ??
    getTrimmed(env, "OPENCLAW_AGENT") ??
    "mirror.local"
  );
}

export function buildMirrorPassport(options: BuildMirrorPassportOptions = {}): MirrorPassport {
  const env = options.env ?? process.env;
  const includeLocal = options.includeLocal === true;

  const passport: MirrorPassport = {
    kind: "mirror.passport",
    issuedAtIso: (options.now ?? new Date()).toISOString(),
    agentIdentity: {
      agentId: resolveAgentId(env),
      runId: getTrimmed(env, "MIRROR_RUN_ID") ?? getTrimmed(env, "OPENCLAW_RUN_ID"),
    },
  };

  if (includeLocal) {
    passport.localOnly = {
      label: "LOCAL ONLY",
      travelerName:
        getTrimmed(env, "MIRROR_TRAVELER_NAME") ?? getTrimmed(env, "OPENCLAW_TRAVELER_NAME"),
      hostName: options.hostName ?? os.hostname(),
      platform: process.platform,
      nodeVersion: process.version,
      cwd: options.cwd ?? process.cwd(),
    };
  }

  return passport;
}
