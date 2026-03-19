import os from "node:os";
import path from "node:path";

function resolveHomeDir(): string {
  return path.resolve(os.homedir());
}

function resolveExplicitPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : undefined;
}

export function resolveMirrorHomeRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_HOME_DIR) ??
    path.join(resolveHomeDir(), ".mirror")
  );
}

export function resolveMirrorSettingsRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_SETTINGS_DIR) ??
    path.join(resolveMirrorHomeRoot(), "config")
  );
}

export function resolveMirrorCoreSettingsPath(explicit?: string): string {
  return path.join(resolveMirrorSettingsRoot(explicit), "mirror.json");
}

export function resolveMirrorProvidersSettingsPath(explicit?: string): string {
  return path.join(resolveMirrorSettingsRoot(explicit), "providers.json");
}

export function resolveMirrorConnectorsSettingsPath(explicit?: string): string {
  return path.join(resolveMirrorSettingsRoot(explicit), "connectors.json");
}

export function resolveMirrorCredentialsSettingsPath(explicit?: string): string {
  return path.join(resolveMirrorSettingsRoot(explicit), "credentials.json");
}

export function resolveMirrorBootstrapEnvFilePath(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_ENV_FILE) ??
    path.join(resolveHomeDir(), ".config", "mirror-runtime", "mirror-runtime.env")
  );
}
