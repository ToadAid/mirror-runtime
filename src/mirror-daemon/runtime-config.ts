import fs from "node:fs/promises";
import path from "node:path";
import type { MirrorDaemonResolvedConfig } from "./config.js";

export type MirrorRuntimeConfigSnapshot = {
  daemon: {
    host: string;
    port: number;
    token: string | null;
    storeRoot: string;
    journalPath: string;
  };
  provider: {
    name: string;
    model: string;
  };
  brain: {
    url?: string;
    authToken?: string;
  };
  runtime: {
    enabled: boolean;
    mode: string;
    name: string;
    version: string;
    commit: string;
  };
  lore: {
    dir?: string;
  };
  pond: {
    id: string;
    name: string;
    agents: string[];
    consultUrl?: string;
    signing: {
      privateKeyPem?: string;
      privateKeyPath?: string;
      publicKeyPem?: string;
      publicKeyPath?: string;
    };
  };
};

type MirrorRuntimeConfigFileShape = {
  runtime?: {
    enabled?: boolean;
    mode?: string;
    name?: string;
    version?: string;
    commit?: string;
    loreDir?: string;
  };
  pond?: {
    id?: string;
    name?: string;
    agents?: string[];
    consultUrl?: string;
    signing?: {
      privateKeyPem?: string;
      privateKeyPath?: string;
      publicKeyPem?: string;
      publicKeyPath?: string;
    };
  };
};

export type MirrorRuntimeConfigOverrides = Partial<{
  daemonHost: string;
  daemonPort: number;
  daemonToken: string | null;
  daemonStoreRoot: string;
  daemonJournalPath: string;
  providerName: string;
  providerModel: string;
  brainUrl: string;
  brainAuthToken: string;
  runtimeEnabled: boolean;
  runtimeMode: string;
  runtimeName: string;
  runtimeVersion: string;
  runtimeCommit: string;
  loreDir: string;
  pondId: string;
  pondName: string;
  pondAgents: string[];
  pondConsultUrl: string;
  pondSigningPrivateKeyPem: string;
  pondSigningPrivateKeyPath: string;
  pondSigningPublicKeyPem: string;
  pondSigningPublicKeyPath: string;
}>;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return values.length > 0 ? values : undefined;
}

function toAbsolutePath(input: string | undefined, baseDir: string): string | undefined {
  if (!input) {
    return undefined;
  }
  return path.resolve(baseDir, input);
}

async function readOptionalRuntimeConfigFile(
  configPath: string,
): Promise<MirrorRuntimeConfigFileShape | null> {
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`invalid runtime config file: ${configPath}`);
    }
    return parsed as MirrorRuntimeConfigFileShape;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function resolvePondAgents(params: {
  overrides?: string[];
  fileValue?: string[];
  envValue?: string;
}): string[] {
  if (params.overrides && params.overrides.length > 0) {
    return params.overrides;
  }
  if (params.fileValue && params.fileValue.length > 0) {
    return params.fileValue;
  }
  const envAgents = params.envValue
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (envAgents && envAgents.length > 0) {
    return envAgents;
  }
  return ["main"];
}

export async function createMirrorRuntimeConfigSnapshot(params: {
  daemonConfig: MirrorDaemonResolvedConfig;
  env?: NodeJS.ProcessEnv;
  overrides?: MirrorRuntimeConfigOverrides;
}): Promise<MirrorRuntimeConfigSnapshot> {
  const env = params.env ?? process.env;
  const overrides = params.overrides ?? {};
  const fileConfig = await readOptionalRuntimeConfigFile(params.daemonConfig.configPath);
  const configDir = path.dirname(params.daemonConfig.configPath);

  return {
    daemon: {
      host: asNonEmptyString(overrides.daemonHost) ?? params.daemonConfig.host,
      port:
        typeof overrides.daemonPort === "number" && Number.isFinite(overrides.daemonPort)
          ? Math.floor(overrides.daemonPort)
          : params.daemonConfig.port,
      token:
        overrides.daemonToken === null
          ? null
          : (asNonEmptyString(overrides.daemonToken ?? undefined) ?? params.daemonConfig.token),
      storeRoot: asNonEmptyString(overrides.daemonStoreRoot) ?? params.daemonConfig.storeRoot,
      journalPath: asNonEmptyString(overrides.daemonJournalPath) ?? params.daemonConfig.journalPath,
    },
    provider: {
      name: asNonEmptyString(overrides.providerName) ?? params.daemonConfig.provider.provider,
      model: asNonEmptyString(overrides.providerModel) ?? params.daemonConfig.provider.model,
    },
    brain: {
      url: asNonEmptyString(overrides.brainUrl) ?? params.daemonConfig.brainUrl,
      authToken: asNonEmptyString(overrides.brainAuthToken) ?? params.daemonConfig.authToken,
    },
    runtime: {
      enabled:
        typeof overrides.runtimeEnabled === "boolean"
          ? overrides.runtimeEnabled
          : typeof fileConfig?.runtime?.enabled === "boolean"
            ? fileConfig.runtime.enabled
            : env.MIRROR_ENABLE_RUNTIME === "true",
      mode:
        asNonEmptyString(overrides.runtimeMode) ??
        asNonEmptyString(fileConfig?.runtime?.mode) ??
        asNonEmptyString(env.MIRROR_RUNTIME_MODE) ??
        "lan",
      name:
        asNonEmptyString(overrides.runtimeName) ??
        asNonEmptyString(fileConfig?.runtime?.name) ??
        asNonEmptyString(env.MIRROR_RUNTIME_NAME) ??
        "openclaw-runtime",
      version:
        asNonEmptyString(overrides.runtimeVersion) ??
        asNonEmptyString(fileConfig?.runtime?.version) ??
        asNonEmptyString(env.MIRROR_RUNTIME_VERSION) ??
        "unknown",
      commit:
        asNonEmptyString(overrides.runtimeCommit) ??
        asNonEmptyString(fileConfig?.runtime?.commit) ??
        asNonEmptyString(env.MIRROR_RUNTIME_COMMIT) ??
        "unknown",
    },
    lore: {
      dir:
        toAbsolutePath(asNonEmptyString(overrides.loreDir), process.cwd()) ??
        toAbsolutePath(asNonEmptyString(fileConfig?.runtime?.loreDir), configDir) ??
        toAbsolutePath(asNonEmptyString(env.MIRROR_LORE_DIR), process.cwd()),
    },
    pond: {
      id:
        asNonEmptyString(overrides.pondId) ??
        asNonEmptyString(fileConfig?.pond?.id) ??
        asNonEmptyString(env.MIRROR_POND_ID) ??
        "toadaid-main",
      name:
        asNonEmptyString(overrides.pondName) ??
        asNonEmptyString(fileConfig?.pond?.name) ??
        asNonEmptyString(env.MIRROR_POND_NAME) ??
        "ToadAid Main",
      agents: resolvePondAgents({
        overrides: asNonEmptyStringArray(overrides.pondAgents),
        fileValue: asNonEmptyStringArray(fileConfig?.pond?.agents),
        envValue: asNonEmptyString(env.MIRROR_POND_AGENTS),
      }),
      consultUrl:
        asNonEmptyString(overrides.pondConsultUrl) ??
        asNonEmptyString(fileConfig?.pond?.consultUrl) ??
        asNonEmptyString(env.MIRROR_POND_CONSULT_URL),
      signing: {
        privateKeyPem:
          asNonEmptyString(overrides.pondSigningPrivateKeyPem) ??
          asNonEmptyString(fileConfig?.pond?.signing?.privateKeyPem) ??
          asNonEmptyString(env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM),
        privateKeyPath:
          asNonEmptyString(overrides.pondSigningPrivateKeyPath) ??
          asNonEmptyString(fileConfig?.pond?.signing?.privateKeyPath) ??
          asNonEmptyString(env.MIRROR_POND_SIGNING_PRIVATE_KEY_PATH),
        publicKeyPem:
          asNonEmptyString(overrides.pondSigningPublicKeyPem) ??
          asNonEmptyString(fileConfig?.pond?.signing?.publicKeyPem) ??
          asNonEmptyString(env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM),
        publicKeyPath:
          asNonEmptyString(overrides.pondSigningPublicKeyPath) ??
          asNonEmptyString(fileConfig?.pond?.signing?.publicKeyPath) ??
          asNonEmptyString(env.MIRROR_POND_SIGNING_PUBLIC_KEY_PATH),
      },
    },
  };
}
