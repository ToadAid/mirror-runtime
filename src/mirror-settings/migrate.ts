import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveMirrorBootstrapEnvFilePath,
  resolveMirrorConnectorsSettingsPath,
  resolveMirrorCoreSettingsPath,
  resolveMirrorCredentialsSettingsPath,
  resolveMirrorProvidersSettingsPath,
} from "./paths.js";
import {
  MIRROR_CONNECTORS_SETTINGS_VERSION,
  MIRROR_CORE_SETTINGS_VERSION,
  MIRROR_CREDENTIALS_SETTINGS_VERSION,
  MIRROR_PROVIDERS_SETTINGS_VERSION,
  type MirrorConnectorsSettingsFile,
  type MirrorCoreSettingsFile,
  type MirrorCredentialsSettingsFile,
  type MirrorProvidersSettingsFile,
} from "./types.js";

type MigrateOptions = {
  env?: NodeJS.ProcessEnv;
};

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

function writeJsonIfMissing(filePath: string, value: unknown, mode?: number): boolean {
  if (fs.existsSync(filePath)) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (typeof mode === "number") {
    try {
      fs.chmodSync(filePath, mode);
    } catch {
      // ignore chmod portability failures
    }
  }
  return true;
}

function inferProviderKind(url: string | undefined): "ollama" | "custom" {
  const normalized = url?.trim().toLowerCase() ?? "";
  return normalized.includes("127.0.0.1:11434") || normalized.includes("localhost:11434")
    ? "ollama"
    : "custom";
}

export function ensureMirrorSettingsMigratedSync(options: MigrateOptions = {}): {
  migrated: boolean;
  created: string[];
} {
  const env = options.env ?? process.env;
  const bootstrapEnvPath = resolveMirrorBootstrapEnvFilePath();
  const bootstrapEnv = parseBootstrapEnvFile(bootstrapEnvPath);
  const hasLegacyBootstrapEnv = fs.existsSync(bootstrapEnvPath);

  const LEGACY_ENV_MAP: Record<string, string> = {
    OPENCLAW_PORT: "MIRROR_PORT",
    OPENCLAW_NODE_ID: "MIRROR_NODE_ID",
    OPENCLAW_BASE_URL: "MIRROR_BASE_URL",
    OPENCLAW_WORKSPACE_ROOT: "MIRROR_WORKSPACE_ROOT",
    OPENCLAW_PROVIDER_URL: "MIRROR_PROVIDER_URL",
    OPENCLAW_PROVIDER_AUTH_TOKEN: "MIRROR_PROVIDER_AUTH_TOKEN",
    OPENCLAW_OPERATOR_TOKEN: "MIRROR_OPERATOR_TOKEN",
  };

  const detectedLegacyVars = Object.keys(LEGACY_ENV_MAP).filter(
    (key) => typeof env[key] === "string" && env[key]?.trim().length,
  );

  if (detectedLegacyVars.length > 0) {
    console.warn(
      `[mirror] WARNING: Legacy environment variables detected: ${detectedLegacyVars.join(", ")}`,
    );
    console.warn("[mirror] Please migrate to MIRROR_* equivalents as OPENCLAW_* is deprecated.");
  }

  const hasLegacyProcessEnv = [
    "MIRROR_PORT",
    "MIRROR_NODE_ID",
    "MIRROR_BASE_URL",
    "MIRROR_WORKSPACE_ROOT",
    "MIRROR_PROVIDER_URL",
    "MIRROR_PROVIDER_AUTH_TOKEN",
    "MIRROR_OPERATOR_TOKEN",
    ...detectedLegacyVars,
  ].some((key) => typeof env[key] === "string" && env[key]?.trim().length);

  if (!hasLegacyBootstrapEnv && !hasLegacyProcessEnv) {
    return {
      migrated: false,
      created: [],
    };
  }

  const envSource = Object.fromEntries(
    Object.entries(env).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;

  // Map legacy vars to source if MIRROR equivalents are missing
  for (const [legacy, mirror] of Object.entries(LEGACY_ENV_MAP)) {
    if (envSource[legacy] && !envSource[mirror]) {
      envSource[mirror] = envSource[legacy];
    }
  }

  const source = {
    ...bootstrapEnv,
    ...envSource,
  };
  const created: string[] = [];
  const migratedAt = new Date().toISOString();

  const workspaceRoot =
    source.MIRROR_WORKSPACE_ROOT?.trim() ||
    path.join(
      source.MIRROR_HOME_DIR?.trim() || path.join(source.HOME?.trim() || os.homedir(), ".mirror"),
      "workspace",
    );

  const mirrorFile: MirrorCoreSettingsFile = {
    version: MIRROR_CORE_SETTINGS_VERSION,
    runtime: {
      port: source.MIRROR_PORT ? Number.parseInt(source.MIRROR_PORT, 10) : 7777,
      node_id: source.MIRROR_NODE_ID?.trim() || undefined,
      base_url: source.MIRROR_BASE_URL?.trim() || null,
      web_ui_enabled: true,
    },
    workspace: {
      root: workspaceRoot,
    },
    onboarding: {
      migrated_from_env_at: migratedAt,
    },
  };
  if (writeJsonIfMissing(resolveMirrorCoreSettingsPath(), mirrorFile)) {
    created.push("mirror.json");
  }

  const providerUrl = source.MIRROR_PROVIDER_URL?.trim();
  const providerCredentialId = providerUrl ? "provider:primary" : null;
  const providersFile: MirrorProvidersSettingsFile = {
    version: MIRROR_PROVIDERS_SETTINGS_VERSION,
    default_provider_id: providerUrl ? "primary" : null,
    providers: providerUrl
      ? [
          {
            id: "primary",
            kind: inferProviderKind(providerUrl),
            label: providerUrl.includes("11434") ? "Local Ollama" : "Primary Provider",
            url: providerUrl,
            model: null,
            enabled: true,
            credential_id: providerCredentialId,
          },
        ]
      : [],
  };
  if (writeJsonIfMissing(resolveMirrorProvidersSettingsPath(), providersFile)) {
    created.push("providers.json");
  }

  const connectorsFile: MirrorConnectorsSettingsFile = {
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
  if (writeJsonIfMissing(resolveMirrorConnectorsSettingsPath(), connectorsFile)) {
    created.push("connectors.json");
  }

  const credentialsFile: MirrorCredentialsSettingsFile = {
    version: MIRROR_CREDENTIALS_SETTINGS_VERSION,
    credentials: {
      ...(source.MIRROR_PROVIDER_AUTH_TOKEN?.trim()
        ? {
            "provider:primary": {
              type: "bearer_token" as const,
              value: source.MIRROR_PROVIDER_AUTH_TOKEN.trim(),
            },
          }
        : {}),
      ...(source.MIRROR_OPERATOR_TOKEN?.trim()
        ? {
            "operator:local": {
              type: "operator_token" as const,
              value: source.MIRROR_OPERATOR_TOKEN.trim(),
            },
          }
        : {}),
    },
  };
  if (writeJsonIfMissing(resolveMirrorCredentialsSettingsPath(), credentialsFile, 0o600)) {
    created.push("credentials.json");
  }

  return {
    migrated: created.length > 0,
    created,
  };
}
