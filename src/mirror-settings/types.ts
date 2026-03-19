export const MIRROR_CORE_SETTINGS_VERSION = 1;
export const MIRROR_PROVIDERS_SETTINGS_VERSION = 1;
export const MIRROR_CONNECTORS_SETTINGS_VERSION = 1;
export const MIRROR_CREDENTIALS_SETTINGS_VERSION = 1;

export type MirrorCoreSettingsFile = {
  version: typeof MIRROR_CORE_SETTINGS_VERSION;
  runtime: {
    port?: number;
    node_id?: string;
    base_url?: string | null;
    web_ui_enabled?: boolean;
  };
  workspace: {
    root?: string;
  };
  onboarding?: {
    completed_at?: string;
    provider_configured?: boolean;
    migrated_from_env_at?: string;
  };
};

export type MirrorProviderKind = "ollama" | "lmstudio" | "openai" | "custom";

export type MirrorProviderSettingsEntry = {
  id: string;
  kind: MirrorProviderKind;
  label: string;
  url?: string;
  model?: string | null;
  enabled?: boolean;
  credential_id?: string | null;
};

export type MirrorProvidersSettingsFile = {
  version: typeof MIRROR_PROVIDERS_SETTINGS_VERSION;
  default_provider_id?: string | null;
  providers: MirrorProviderSettingsEntry[];
};

export type MirrorConnectorSetupState = "unconfigured" | "configured" | "paired";

export type MirrorConnectorSettingsEntry = {
  enabled?: boolean;
  setup_state?: MirrorConnectorSetupState;
  credential_id?: string | null;
};

export type MirrorConnectorsSettingsFile = {
  version: typeof MIRROR_CONNECTORS_SETTINGS_VERSION;
  mode: "api_only" | "local_ui" | "connectors";
  local_web_ui: {
    enabled?: boolean;
  };
  connectors: {
    telegram?: MirrorConnectorSettingsEntry;
    whatsapp?: MirrorConnectorSettingsEntry;
  };
};

export type MirrorCredentialType = "bearer_token" | "operator_token" | "bot_token";

export type MirrorCredentialEntry = {
  type: MirrorCredentialType;
  value: string;
};

export type MirrorCredentialsSettingsFile = {
  version: typeof MIRROR_CREDENTIALS_SETTINGS_VERSION;
  credentials: Record<string, MirrorCredentialEntry>;
};

export type MirrorSettingsFiles = {
  mirror: MirrorCoreSettingsFile;
  providers: MirrorProvidersSettingsFile;
  connectors: MirrorConnectorsSettingsFile;
  credentials: MirrorCredentialsSettingsFile;
};

export type MirrorResolvedSettingsOverrides = {
  runtime?: {
    port?: number;
    node_id?: string;
    base_url?: string | null;
    workspace_root?: string;
    web_ui_enabled?: boolean;
  };
  provider?: {
    id?: string;
    url?: string;
    token?: string;
    model?: string | null;
  };
  operator_token?: string | null;
};

export type MirrorResolvedSettings = {
  files: MirrorSettingsFiles;
  paths: {
    root: string;
    mirror: string;
    providers: string;
    connectors: string;
    credentials: string;
    bootstrap_env: string;
  };
  runtime: {
    port: number;
    node_id: string;
    base_url: string | null;
    web_ui_enabled: boolean;
  };
  workspace: {
    root: string;
    users_root: string;
    lore_dir: string;
    state_root: string;
    logs_root: string;
    memory_db_path: string;
  };
  provider: {
    default_provider_id: string | null;
    active: {
      id: string;
      kind: MirrorProviderKind;
      label: string;
      url: string;
      model: string | null;
      enabled: boolean;
      credential_id: string | null;
      auth_token: string;
    } | null;
  };
  connectors: MirrorConnectorsSettingsFile;
  credentials: MirrorCredentialsSettingsFile;
  operator_token: string | null;
};
