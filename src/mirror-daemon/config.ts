import fs from "node:fs/promises";
import path from "node:path";

export type MirrorDaemonProviderConfig = {
  provider: string;
  model: string;
};

export type MirrorDaemonResolvedConfig = {
  host: string;
  port: number;
  token: string | null;
  storeRoot: string;
  journalPath: string;
  provider: MirrorDaemonProviderConfig;
  brainUrl?: string;
  authToken?: string;
  configPath: string;
};

export type MirrorDaemonConfigOverrides = Partial<{
  host: string;
  port: number;
  token: string | null;
  storeRoot: string;
  journalPath: string;
  provider: string;
  providerModel: string;
  brainUrl: string;
  authToken: string;
}>;

type MirrorDaemonFileConfig = {
  daemon?: {
    host?: string;
    port?: number;
    token?: string;
    storeRoot?: string;
    journalPath?: string;
  };
  provider?: {
    name?: string;
    model?: string;
  };
  brain?: {
    url?: string;
    authToken?: string;
  };
};

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

function toAbsolutePath(input: string | undefined, baseDir: string): string | undefined {
  if (!input) {
    return undefined;
  }
  return path.resolve(baseDir, input);
}

async function readOptionalConfigFile(configPath: string): Promise<MirrorDaemonFileConfig | null> {
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`invalid daemon config file: ${configPath}`);
    }
    return parsed as MirrorDaemonFileConfig;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function resolveMirrorDaemonConfig(params?: {
  overrides?: MirrorDaemonConfigOverrides;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<MirrorDaemonResolvedConfig> {
  const env = params?.env ?? process.env;
  const cwd = path.resolve(params?.cwd ?? process.cwd());
  const configPath = path.resolve(params?.configPath ?? path.join(cwd, ".mirror", "config.json"));
  const configDir = path.dirname(configPath);
  const fileConfig = await readOptionalConfigFile(configPath);
  const overrides = params?.overrides ?? {};

  const envHost = asNonEmptyString(env.MIRROR_DAEMON_HOST);
  const envPort = asPort(env.MIRROR_DAEMON_PORT ?? env.MIRROR_RUNTIME_PORT);
  const envToken = asNonEmptyString(env.MIRROR_DAEMON_TOKEN);
  const envStoreRoot = toAbsolutePath(asNonEmptyString(env.MIRROR_DAEMON_STORE_ROOT), cwd);
  const envJournalPath = toAbsolutePath(asNonEmptyString(env.MIRROR_RUN_JOURNAL_PATH), cwd);
  const envProvider = asNonEmptyString(env.MIRROR_PROVIDER);
  const envProviderModel = asNonEmptyString(env.MIRROR_PROVIDER_MODEL);
  const envBrainUrl = asNonEmptyString(env.MIRROR_BRAIN_URL);
  const envAuthToken = asNonEmptyString(env.MIRROR_BRAIN_AUTH_TOKEN);

  const fileHost = asNonEmptyString(fileConfig?.daemon?.host);
  const filePort = asPort(fileConfig?.daemon?.port);
  const fileToken = asNonEmptyString(fileConfig?.daemon?.token);
  const fileStoreRoot = toAbsolutePath(asNonEmptyString(fileConfig?.daemon?.storeRoot), configDir);
  const fileJournalPath = toAbsolutePath(
    asNonEmptyString(fileConfig?.daemon?.journalPath),
    configDir,
  );
  const fileProvider = asNonEmptyString(fileConfig?.provider?.name);
  const fileProviderModel = asNonEmptyString(fileConfig?.provider?.model);
  const fileBrainUrl = asNonEmptyString(fileConfig?.brain?.url);
  const fileAuthToken = asNonEmptyString(fileConfig?.brain?.authToken);

  const overrideStoreRoot = toAbsolutePath(asNonEmptyString(overrides.storeRoot), cwd);
  const resolvedStoreRoot =
    overrideStoreRoot ?? fileStoreRoot ?? envStoreRoot ?? path.resolve(cwd, ".mirror");

  const overrideJournalPath = toAbsolutePath(asNonEmptyString(overrides.journalPath), cwd);
  const resolvedJournalPath =
    overrideJournalPath ??
    fileJournalPath ??
    envJournalPath ??
    path.resolve(resolvedStoreRoot, "run_journal.jsonl");

  return {
    host: asNonEmptyString(overrides.host) ?? fileHost ?? envHost ?? "127.0.0.1",
    port: asPort(overrides.port) ?? filePort ?? envPort ?? 8787,
    token:
      overrides.token === null
        ? null
        : (asNonEmptyString(overrides.token ?? undefined) ?? fileToken ?? envToken ?? null),
    storeRoot: resolvedStoreRoot,
    journalPath: resolvedJournalPath,
    provider: {
      provider: asNonEmptyString(overrides.provider) ?? fileProvider ?? envProvider ?? "brain-chat",
      model:
        asNonEmptyString(overrides.providerModel) ??
        fileProviderModel ??
        envProviderModel ??
        "gpt-4o-mini",
    },
    brainUrl: asNonEmptyString(overrides.brainUrl) ?? fileBrainUrl ?? envBrainUrl,
    authToken: asNonEmptyString(overrides.authToken) ?? fileAuthToken ?? envAuthToken,
    configPath,
  };
}

export function buildProviderEnvFromDaemonConfig(
  config: MirrorDaemonResolvedConfig,
): NodeJS.ProcessEnv {
  return {
    MIRROR_PROVIDER: config.provider.provider,
    MIRROR_PROVIDER_MODEL: config.provider.model,
  };
}
