import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureMirrorSettingsMigratedSync } from "./migrate.js";
import {
  resolveMirrorBootstrapEnvFilePath,
  resolveMirrorConnectorsSettingsPath,
  resolveMirrorCoreSettingsPath,
  resolveMirrorCredentialsSettingsPath,
  resolveMirrorProvidersSettingsPath,
  resolveMirrorSettingsRoot,
} from "./paths.js";
import {
  MIRROR_CONNECTORS_SETTINGS_VERSION,
  MIRROR_CORE_SETTINGS_VERSION,
  MIRROR_CREDENTIALS_SETTINGS_VERSION,
  MIRROR_PROVIDERS_SETTINGS_VERSION,
  type MirrorConnectorsSettingsFile,
  type MirrorCoreSettingsFile,
  type MirrorCredentialsSettingsFile,
  type MirrorResolvedSettings,
  type MirrorResolvedSettingsOverrides,
  type MirrorSettingsFiles,
  type MirrorProvidersSettingsFile,
} from "./types.js";

type ResolveOptions = {
  env?: NodeJS.ProcessEnv;
  overrides?: MirrorResolvedSettingsOverrides;
  skipMigration?: boolean;
};

function defaultCoreSettings(): MirrorCoreSettingsFile {
  return {
    version: MIRROR_CORE_SETTINGS_VERSION,
    runtime: {
      web_ui_enabled: true,
    },
    workspace: {},
    onboarding: {},
  };
}

function defaultProvidersSettings(): MirrorProvidersSettingsFile {
  return {
    version: MIRROR_PROVIDERS_SETTINGS_VERSION,
    default_provider_id: null,
    providers: [],
  };
}

function defaultConnectorsSettings(): MirrorConnectorsSettingsFile {
  return {
    version: MIRROR_CONNECTORS_SETTINGS_VERSION,
    mode: "api_only",
    local_web_ui: {
      enabled: true,
    },
    connectors: {
      telegram: {
        enabled: false,
        setup_state: "unconfigured",
        credential_id: "telegram:default",
      },
      whatsapp: {
        enabled: false,
        setup_state: "unconfigured",
        credential_id: null,
      },
    },
  };
}

function defaultCredentialsSettings(): MirrorCredentialsSettingsFile {
  return {
    version: MIRROR_CREDENTIALS_SETTINGS_VERSION,
    credentials: {},
  };
}

function readJsonFileSync<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function parseBootstrapEnvFile(filePath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const values: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
    }
    return values;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function resolveExplicitEnvValue(
  env: NodeJS.ProcessEnv,
  bootstrapEnv: Record<string, string>,
  key: string,
): string | undefined {
  const current = env[key];
  if (typeof current !== "string" || current.trim().length === 0) {
    return undefined;
  }
  const bootstrap = bootstrapEnv[key];
  if (typeof bootstrap === "string" && bootstrap === current) {
    return undefined;
  }
  return current.trim();
}

function resolveUserFacingString(params: {
  cliValue?: string | null;
  env: NodeJS.ProcessEnv;
  bootstrapEnv: Record<string, string>;
  envKey: string;
  configValue?: string | null;
  bootstrapValue?: string | null;
  fallback?: string | null;
}): string | null {
  const cliValue = params.cliValue?.trim();
  if (cliValue) {
    return cliValue;
  }
  const envValue = resolveExplicitEnvValue(params.env, params.bootstrapEnv, params.envKey);
  if (envValue) {
    return envValue;
  }
  const configValue = params.configValue?.trim();
  if (configValue) {
    return configValue;
  }
  const bootstrapValue = params.bootstrapValue?.trim();
  if (bootstrapValue) {
    return bootstrapValue;
  }
  const fallback = params.fallback?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}

function resolveUserFacingNumber(params: {
  cliValue?: number;
  env: NodeJS.ProcessEnv;
  bootstrapEnv: Record<string, string>;
  envKey: string;
  configValue?: number;
  bootstrapValue?: string;
  fallback: number;
}): number {
  if (typeof params.cliValue === "number" && Number.isInteger(params.cliValue)) {
    return params.cliValue;
  }
  const envValue = resolveExplicitEnvValue(params.env, params.bootstrapEnv, params.envKey);
  if (envValue) {
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  if (typeof params.configValue === "number" && Number.isInteger(params.configValue)) {
    return params.configValue;
  }
  if (typeof params.bootstrapValue === "string" && params.bootstrapValue.trim().length > 0) {
    const parsed = Number.parseInt(params.bootstrapValue, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return params.fallback;
}

function resolveEnvBackedPath(
  env: NodeJS.ProcessEnv,
  bootstrapEnv: Record<string, string>,
  key: string,
  fallback: string,
): string {
  const explicitValue = env[key]?.trim();
  if (explicitValue) {
    return path.resolve(explicitValue);
  }
  const bootstrapValue = bootstrapEnv[key]?.trim();
  if (bootstrapValue) {
    return path.resolve(bootstrapValue);
  }
  return path.resolve(fallback);
}

function loadSettingsFilesSync(rootOverride?: string): MirrorSettingsFiles {
  return {
    mirror: readJsonFileSync(resolveMirrorCoreSettingsPath(rootOverride), defaultCoreSettings()),
    providers: readJsonFileSync(
      resolveMirrorProvidersSettingsPath(rootOverride),
      defaultProvidersSettings(),
    ),
    connectors: readJsonFileSync(
      resolveMirrorConnectorsSettingsPath(rootOverride),
      defaultConnectorsSettings(),
    ),
    credentials: readJsonFileSync(
      resolveMirrorCredentialsSettingsPath(rootOverride),
      defaultCredentialsSettings(),
    ),
  };
}

function chooseActiveProvider(
  providers: MirrorProvidersSettingsFile,
  credentials: MirrorCredentialsSettingsFile,
  resolvedUrl: string | null,
  resolvedToken: string | null,
  overrideId?: string,
): MirrorResolvedSettings["provider"]["active"] {
  const configuredProviders = providers.providers.filter((entry) => entry.enabled !== false);
  const selectedId =
    overrideId?.trim() ||
    providers.default_provider_id?.trim() ||
    configuredProviders[0]?.id ||
    null;
  const selected =
    configuredProviders.find((entry) => entry.id === selectedId) ?? configuredProviders[0] ?? null;
  if (!selected) {
    if (!resolvedUrl || !resolvedToken) {
      return null;
    }
    return {
      id: overrideId?.trim() || "primary",
      kind: "custom",
      label: "Primary Provider",
      url: resolvedUrl,
      model: null,
      enabled: true,
      credential_id: null,
      auth_token: resolvedToken,
    };
  }
  const credential = selected.credential_id
    ? credentials.credentials[selected.credential_id]
    : undefined;
  const authToken = resolvedToken ?? credential?.value ?? "";
  const url = resolvedUrl ?? selected.url?.trim() ?? "";
  return {
    id: selected.id,
    kind: selected.kind,
    label: selected.label,
    url,
    model: selected.model ?? null,
    enabled: selected.enabled !== false,
    credential_id: selected.credential_id ?? null,
    auth_token: authToken,
  };
}

export function loadMirrorSettingsSync(options: ResolveOptions = {}): MirrorResolvedSettings {
  const env = options.env ?? process.env;
  if (!options.skipMigration) {
    ensureMirrorSettingsMigratedSync({ env });
  }
  const bootstrapEnvPath = resolveMirrorBootstrapEnvFilePath();
  const bootstrapEnv = parseBootstrapEnvFile(bootstrapEnvPath);
  const files = loadSettingsFilesSync();

  const settingsRoot = resolveMirrorSettingsRoot();
  const defaultHomeRoot = path.resolve(
    env.MIRROR_HOME_DIR?.trim() || path.join(env.HOME || os.homedir(), ".mirror"),
  );
  const defaultWorkspaceRoot = path.join(defaultHomeRoot, "workspace");
  const workspaceRoot =
    resolveUserFacingString({
      cliValue: options.overrides?.runtime?.workspace_root,
      env,
      bootstrapEnv,
      envKey: "MIRROR_WORKSPACE_ROOT",
      configValue: files.mirror.workspace.root,
      bootstrapValue: bootstrapEnv.MIRROR_WORKSPACE_ROOT,
      fallback: defaultWorkspaceRoot,
    }) ?? defaultWorkspaceRoot;

  const usersRoot = resolveEnvBackedPath(
    env,
    bootstrapEnv,
    "MIRROR_USER_WORKSPACE_DIR",
    path.join(workspaceRoot, "users"),
  );
  const loreDir = resolveEnvBackedPath(
    env,
    bootstrapEnv,
    "MIRROR_LORE_DIR",
    path.join(workspaceRoot, "lore"),
  );
  const stateRoot = resolveEnvBackedPath(
    env,
    bootstrapEnv,
    "MIRROR_STATE_DIR",
    path.join(defaultHomeRoot, "state"),
  );
  const logsRoot = resolveEnvBackedPath(
    env,
    bootstrapEnv,
    "MIRROR_LOG_DIR",
    path.join(defaultHomeRoot, "logs"),
  );
  const memoryDbPath = resolveEnvBackedPath(
    env,
    bootstrapEnv,
    "MIRROR_MEMORY_DB_PATH",
    path.join(stateRoot, "mirror-memory.db"),
  );

  const providerUrl =
    resolveUserFacingString({
      cliValue: options.overrides?.provider?.url,
      env,
      bootstrapEnv,
      envKey: "MIRROR_PROVIDER_URL",
      configValue:
        files.providers.providers.find((entry) => entry.id === files.providers.default_provider_id)
          ?.url ?? files.providers.providers[0]?.url,
      bootstrapValue: bootstrapEnv.MIRROR_PROVIDER_URL,
      fallback: null,
    }) ?? null;

  const providerToken =
    resolveUserFacingString({
      cliValue: options.overrides?.provider?.token,
      env,
      bootstrapEnv,
      envKey: "MIRROR_PROVIDER_AUTH_TOKEN",
      configValue: null,
      bootstrapValue: bootstrapEnv.MIRROR_PROVIDER_AUTH_TOKEN,
      fallback: null,
    }) ??
    files.credentials.credentials["provider:primary"]?.value ??
    null;

  const activeProvider = chooseActiveProvider(
    files.providers,
    files.credentials,
    providerUrl,
    providerToken,
    options.overrides?.provider?.id,
  );

  const operatorToken =
    resolveUserFacingString({
      cliValue: options.overrides?.operator_token,
      env,
      bootstrapEnv,
      envKey: "MIRROR_OPERATOR_TOKEN",
      configValue: files.credentials.credentials["operator:local"]?.value ?? null,
      bootstrapValue: bootstrapEnv.MIRROR_OPERATOR_TOKEN,
      fallback: null,
    }) ?? null;

  return {
    files,
    paths: {
      root: settingsRoot,
      mirror: resolveMirrorCoreSettingsPath(),
      providers: resolveMirrorProvidersSettingsPath(),
      connectors: resolveMirrorConnectorsSettingsPath(),
      credentials: resolveMirrorCredentialsSettingsPath(),
      bootstrap_env: bootstrapEnvPath,
    },
    runtime: {
      port: resolveUserFacingNumber({
        cliValue: options.overrides?.runtime?.port,
        env,
        bootstrapEnv,
        envKey: "MIRROR_PORT",
        configValue: files.mirror.runtime.port,
        bootstrapValue: bootstrapEnv.MIRROR_PORT,
        fallback: 7777,
      }),
      node_id:
        resolveUserFacingString({
          cliValue: options.overrides?.runtime?.node_id,
          env,
          bootstrapEnv,
          envKey: "MIRROR_NODE_ID",
          configValue: files.mirror.runtime.node_id,
          bootstrapValue: bootstrapEnv.MIRROR_NODE_ID,
          fallback: "mirror-node-local",
        }) ?? "mirror-node-local",
      base_url: resolveUserFacingString({
        cliValue: options.overrides?.runtime?.base_url ?? undefined,
        env,
        bootstrapEnv,
        envKey: "MIRROR_BASE_URL",
        configValue: files.mirror.runtime.base_url ?? null,
        bootstrapValue: bootstrapEnv.MIRROR_BASE_URL,
        fallback: null,
      }),
      web_ui_enabled:
        options.overrides?.runtime?.web_ui_enabled ??
        files.mirror.runtime.web_ui_enabled ??
        files.connectors.local_web_ui.enabled ??
        true,
    },
    workspace: {
      root: workspaceRoot,
      users_root: usersRoot,
      lore_dir: loreDir,
      state_root: stateRoot,
      logs_root: logsRoot,
      memory_db_path: memoryDbPath,
    },
    provider: {
      default_provider_id: files.providers.default_provider_id ?? activeProvider?.id ?? null,
      active: activeProvider,
    },
    connectors: files.connectors,
    credentials: files.credentials,
    operator_token: operatorToken,
  };
}

export function readMirrorCoreSettingsFileSync(): MirrorCoreSettingsFile {
  return loadSettingsFilesSync().mirror;
}

function writeJsonAtomicSync(filePath: string, value: unknown, mode?: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}`,
  );
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (typeof mode === "number") {
    try {
      fs.chmodSync(tempPath, mode);
    } catch {
      // ignore chmod portability failures
    }
  }
  fs.renameSync(tempPath, filePath);
  if (typeof mode === "number") {
    try {
      fs.chmodSync(filePath, mode);
    } catch {
      // ignore chmod portability failures
    }
  }
}

export function writeMirrorSettingsFilesSync(
  next: Partial<MirrorSettingsFiles>,
  rootOverride?: string,
): MirrorSettingsFiles {
  const current = loadSettingsFilesSync(rootOverride);
  const merged: MirrorSettingsFiles = {
    mirror: next.mirror ?? current.mirror,
    providers: next.providers ?? current.providers,
    connectors: next.connectors ?? current.connectors,
    credentials: next.credentials ?? current.credentials,
  };
  writeJsonAtomicSync(resolveMirrorCoreSettingsPath(rootOverride), merged.mirror);
  writeJsonAtomicSync(resolveMirrorProvidersSettingsPath(rootOverride), merged.providers);
  writeJsonAtomicSync(resolveMirrorConnectorsSettingsPath(rootOverride), merged.connectors);
  writeJsonAtomicSync(
    resolveMirrorCredentialsSettingsPath(rootOverride),
    merged.credentials,
    0o600,
  );
  return merged;
}

export function redactMirrorCredentials(
  credentials: MirrorCredentialsSettingsFile,
): Record<string, { type: string; configured: boolean }> {
  return Object.fromEntries(
    Object.entries(credentials.credentials).map(([key, value]) => [
      key,
      {
        type: value.type,
        configured: value.value.trim().length > 0,
      },
    ]),
  );
}
