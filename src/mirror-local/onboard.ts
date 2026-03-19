import os from "node:os";
import path from "node:path";
import { confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import {
  loadMirrorSettingsSync,
  writeMirrorSettingsFilesSync,
  type MirrorProviderKind,
} from "../mirror-settings/index.js";
import {
  buildMirrorOperatorEnv,
  detectOllamaAvailability,
  ensureMirrorRuntimeSupportDirs,
  ensureMirrorWorkspaceLayout,
  getMirrorServiceStatus,
  isPortInUse,
  writeMirrorOperatorEnvFile,
} from "./operator_env.js";
import { resolveMirrorWorkspaceRoot } from "./paths.js";
import { installMirrorUserService } from "./service_install.js";
import { validateTelegramBotToken } from "./telegram.js";

export type MirrorOnboardOptions = {
  yes?: boolean;
  providerMode?: "ollama" | "openai" | "skip";
  providerUrl?: string;
  providerToken?: string;
  providerModel?: string;
  port?: number;
  workspaceRoot?: string;
  telegramMode?: "configure" | "skip";
  telegramToken?: string;
  installService?: boolean;
  serviceExecStart?: string;
  unitDir?: string;
  daemonReload?: boolean;
};

type PromptValue<T> = T | symbol;

type ProviderWizardState =
  | {
      configured: false;
      kind: null;
      label: string;
      url: "";
      token: "";
      model: null;
    }
  | {
      configured: true;
      kind: MirrorProviderKind;
      label: string;
      url: string;
      token: string;
      model: string;
    };

type TelegramWizardState = {
  enabled: boolean;
  setup_state: "unconfigured" | "configured";
  token: string;
  validation:
    | {
        ok: true;
        bot: {
          id: number;
          username: string | null;
          display_name: string | null;
        };
      }
    | {
        ok: false;
        error: string;
      }
    | null;
};

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertPrompt<T>(value: PromptValue<T>): T {
  if (isCancel(value)) {
    throw new Error("mirror onboard cancelled");
  }
  return value;
}

function summarizeBotIdentity(
  bot: {
    id: number;
    username: string | null;
    display_name: string | null;
  } | null,
): string {
  if (!bot) {
    return "not validated";
  }
  const username = bot.username ? `@${bot.username}` : "no username";
  const displayName = bot.display_name ? `${bot.display_name} · ` : "";
  return `${displayName}${username} · id ${bot.id}`;
}

async function chooseProvider(
  options: MirrorOnboardOptions,
  ollamaAvailable: boolean,
): Promise<ProviderWizardState> {
  const providerMode = options.providerMode;
  const inferredMode =
    providerMode ??
    (options.providerUrl
      ? "openai"
      : options.yes
        ? ollamaAvailable
          ? "ollama"
          : "skip"
        : undefined);

  if (options.yes) {
    if (inferredMode === "skip") {
      return {
        configured: false,
        kind: null,
        label: "Skip for now",
        url: "",
        token: "",
        model: null,
      };
    }
    if (inferredMode === "ollama") {
      return {
        configured: true,
        kind: "ollama",
        label: "Ollama",
        url: options.providerUrl?.trim() || "http://localhost:11434/v1/chat/completions",
        token: options.providerToken?.trim() || "ollama",
        model: options.providerModel?.trim() || "llama3",
      };
    }
    return {
      configured: true,
      kind: "openai",
      label: "OpenAI-compatible endpoint",
      url: options.providerUrl?.trim() || "https://provider.example/v1/chat/completions",
      token: options.providerToken?.trim() || "replace-me",
      model: options.providerModel?.trim() || "mirror-default",
    };
  }

  process.stdout.write(
    "\nStep 2 — Model Provider\nSelect the model provider Mirror should use for chat.\n",
  );
  const choice = assertPrompt(
    await select({
      message: "Select model provider",
      options: [
        {
          value: "ollama",
          label: "Ollama",
          hint: ollamaAvailable
            ? "recommended local · detected on localhost:11434"
            : "recommended local",
        },
        {
          value: "openai",
          label: "OpenAI-compatible endpoint",
          hint: "custom local or remote OpenAI-compatible API",
        },
        {
          value: "skip",
          label: "Skip for now",
          hint: "leave provider unconfigured for now",
        },
      ],
      initialValue: inferredMode ?? (ollamaAvailable ? "ollama" : "openai"),
    }),
  );

  if (choice === "skip") {
    return {
      configured: false,
      kind: null,
      label: "Skip for now",
      url: "",
      token: "",
      model: null,
    };
  }

  if (choice === "ollama") {
    const baseUrl = assertPrompt(
      await text({
        message: "Ollama base URL",
        initialValue: options.providerUrl || "http://localhost:11434",
        placeholder: "http://localhost:11434",
      }),
    ).trim();
    const model = assertPrompt(
      await text({
        message: "Default model name",
        initialValue: options.providerModel || "llama3",
        placeholder: "llama3",
      }),
    ).trim();
    return {
      configured: true,
      kind: "ollama",
      label: "Ollama",
      url: `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
      token: "ollama",
      model: model || "llama3",
    };
  }

  const url = assertPrompt(
    await text({
      message: "OpenAI-compatible base URL",
      initialValue: options.providerUrl || "https://provider.example/v1/chat/completions",
      placeholder: "https://provider.example/v1/chat/completions",
    }),
  ).trim();
  const token = assertPrompt(
    await text({
      message: "Provider token",
      initialValue: options.providerToken || "replace-me",
      placeholder: "replace-me",
    }),
  ).trim();
  const model = assertPrompt(
    await text({
      message: "Default model name",
      initialValue: options.providerModel || "mirror-default",
      placeholder: "mirror-default",
    }),
  ).trim();

  return {
    configured: true,
    kind: "openai",
    label: "OpenAI-compatible endpoint",
    url,
    token,
    model: model || "mirror-default",
  };
}

async function chooseTelegram(options: MirrorOnboardOptions): Promise<TelegramWizardState> {
  if (options.yes) {
    if (options.telegramMode !== "configure") {
      return {
        enabled: false,
        setup_state: "unconfigured",
        token: "",
        validation: null,
      };
    }
    const token = options.telegramToken?.trim() || "";
    const validation = token ? await validateTelegramBotToken(token) : null;
    if (!token) {
      return {
        enabled: false,
        setup_state: "unconfigured",
        token: "",
        validation: null,
      };
    }
    if (!validation?.ok) {
      throw new Error(validation?.error || "Telegram validation failed");
    }
    return {
      enabled: true,
      setup_state: "configured",
      token,
      validation,
    };
  }

  process.stdout.write(
    "\nStep 4 — Telegram Connector\nConfigure Telegram now, or skip it and add it later in Mirror Web settings.\n",
  );
  const shouldConfigure = assertPrompt(
    await select({
      message: "Configure Telegram now?",
      options: [
        {
          value: "configure",
          label: "Yes",
          hint: "validate the bot token now",
        },
        {
          value: "skip",
          label: "Skip",
          hint: "leave Telegram disabled for now",
        },
      ],
      initialValue: "skip",
    }),
  );

  if (shouldConfigure !== "configure") {
    return {
      enabled: false,
      setup_state: "unconfigured",
      token: "",
      validation: null,
    };
  }

  while (true) {
    const token = assertPrompt(
      await text({
        message: "Telegram bot token",
        initialValue: options.telegramToken || "",
        placeholder: "123456:ABCDEF...",
      }),
    ).trim();
    const validation = await validateTelegramBotToken(token);
    if (validation.ok) {
      process.stdout.write(`Validated Telegram bot: ${summarizeBotIdentity(validation.bot)}\n`);
      return {
        enabled: true,
        setup_state: "configured",
        token,
        validation,
      };
    }
    process.stdout.write(`Telegram validation failed: ${validation.error}\n`);
    const retry = assertPrompt(
      await confirm({
        message: "Retry Telegram token entry?",
        initialValue: true,
      }),
    );
    if (!retry) {
      return {
        enabled: false,
        setup_state: "unconfigured",
        token: "",
        validation,
      };
    }
  }
}

export async function runMirrorOnboard(options: MirrorOnboardOptions = {}): Promise<string> {
  const workspaceRoot = options.workspaceRoot ?? resolveMirrorWorkspaceRoot();
  const configRoot = path.join(os.homedir(), ".mirror", "config");
  const runtimeSupportRoot = path.join(os.homedir(), ".local", "share", "mirror-runtime");
  const suggestedPort = options.port ?? ((await isPortInUse(8787)) ? 18787 : 8787);
  const ollamaAvailable = await detectOllamaAvailability();

  if (!options.yes) {
    intro("Mirror Runtime Onboarding");
    process.stdout.write(
      [
        "This wizard will configure your local Mirror.",
        "",
        "Step 1 — Welcome",
        `config:  ${configRoot}`,
        `runtime: ${runtimeSupportRoot}`,
        `workspace: ${workspaceRoot}`,
        "",
      ].join("\n"),
    );
    const proceed = assertPrompt(
      await confirm({
        message: "Continue with Mirror onboarding?",
        initialValue: true,
      }),
    );
    if (!proceed) {
      throw new Error("mirror onboard cancelled");
    }
  }

  const provider = await chooseProvider(options, ollamaAvailable);

  if (!options.yes) {
    process.stdout.write(
      "\nStep 3 — Workspace / Data\nCreating Mirror workspace and runtime support directories if they are missing.\n",
    );
  }
  const { layout, migrated } = await ensureMirrorWorkspaceLayout({ migrateLegacy: true });
  const runtimeSupport = await ensureMirrorRuntimeSupportDirs(runtimeSupportRoot);

  const telegram = await chooseTelegram(options);

  let port = suggestedPort;
  if (options.yes) {
    port = options.port ?? suggestedPort;
  } else {
    process.stdout.write(
      "\nStep 5 — Console / UI\nMirror Web and the local runtime will listen on this port.\n",
    );
    port = parseInteger(
      assertPrompt(
        await text({
          message: "Console port",
          initialValue: String(suggestedPort),
          placeholder: "8787",
        }),
      ),
      suggestedPort,
    );
  }

  const currentSettings = loadMirrorSettingsSync();
  writeMirrorSettingsFilesSync({
    mirror: {
      version: 1,
      runtime: {
        port,
        node_id: os.hostname() || "mirror-node-local",
        base_url: null,
        web_ui_enabled: true,
      },
      workspace: {
        root: layout.workspace_root,
      },
      onboarding: {
        completed_at: new Date().toISOString(),
        provider_configured: provider.configured,
      },
    },
    providers: {
      version: 1,
      default_provider_id: provider.configured ? "primary" : null,
      providers: provider.configured
        ? [
            {
              id: "primary",
              kind: provider.kind,
              label: provider.label,
              url: provider.url,
              model: provider.model,
              enabled: true,
              credential_id: "provider:primary",
            },
          ]
        : [],
    },
    connectors: {
      version: 1,
      mode: telegram.enabled ? "connectors" : "local_ui",
      local_web_ui: {
        enabled: true,
      },
      connectors: {
        telegram: {
          enabled: telegram.enabled,
          setup_state: telegram.setup_state,
          credential_id: "telegram:default",
        },
        whatsapp: {
          enabled: false,
          setup_state: "unconfigured",
          credential_id: null,
        },
      },
    },
    credentials: {
      version: 1,
      credentials: {
        ...(currentSettings.credentials.credentials["operator:local"]
          ? { "operator:local": currentSettings.credentials.credentials["operator:local"] }
          : {}),
        ...(provider.configured
          ? {
              "provider:primary": {
                type: "bearer_token" as const,
                value: provider.token,
              },
            }
          : {}),
        ...(telegram.enabled
          ? {
              "telegram:default": {
                type: "bot_token" as const,
                value: telegram.token,
              },
            }
          : {}),
      },
    },
  });

  const env = await buildMirrorOperatorEnv({
    port,
    workspaceRoot: layout.workspace_root,
    usersRoot: layout.users_root,
    loreDir: layout.lore_root,
    stateRoot: layout.state_root,
    logsRoot: layout.logs_root,
    memoryDbPath: layout.memory_db_path,
  });
  await writeMirrorOperatorEnvFile(env);

  let installService = options.installService === true;
  if (!options.yes && process.platform === "linux") {
    process.stdout.write(
      "\nStep 6 — Install Service\nMirror can install a systemd --user service so the runtime is ready to start in the background.\n",
    );
    const serviceChoice = assertPrompt(
      await select({
        message: "Install mirror-runtime as a background service?",
        options: [
          {
            value: "systemd",
            label: "systemd user service (Linux)",
            hint: "writes ~/.config/systemd/user/mirror-runtime.service",
          },
          {
            value: "skip",
            label: "skip",
            hint: "manage the service manually later",
          },
        ],
        initialValue: "skip",
      }),
    );
    installService = serviceChoice === "systemd";
  }

  let installedService:
    | {
        unitPath: string;
        execStart: string;
        daemonReloaded: boolean | null;
      }
    | undefined;
  if (installService) {
    installedService = await installMirrorUserService({
      envFilePath: env.envFilePath,
      workingDirectory: layout.workspace_root,
      execStart: options.serviceExecStart,
      unitDir: options.unitDir,
      daemonReload: options.daemonReload,
    });
  }

  const serviceStatus = await getMirrorServiceStatus();
  const lines = [
    "Mirror configuration summary",
    "",
    `Config root:           ${configRoot}`,
    `Workspace root:        ${layout.workspace_root}`,
    `Runtime support dir:   ${runtimeSupport.root}`,
    `Console port:          ${port}`,
    `Model provider:        ${provider.configured ? `${provider.label} (${provider.model})` : "skipped for now"}`,
    `Provider URL:          ${provider.configured ? provider.url : "not configured"}`,
    `Telegram:              ${
      telegram.enabled
        ? `enabled · ${summarizeBotIdentity(telegram.validation?.ok ? telegram.validation.bot : null)}`
        : "not configured"
    }`,
    `Data dir:              ${layout.workspace_root}`,
    `Service unit:          ${
      installedService?.unitPath ??
      (serviceStatus.unitInstalled
        ? path.join(os.homedir(), ".config", "systemd", "user", "mirror-runtime.service")
        : "not installed")
    }`,
  ];

  if (migrated.length > 0) {
    lines.push("", "Migrated legacy data:");
    for (const item of migrated) {
      lines.push(`- ${item}`);
    }
  }

  lines.push(
    "",
    "Created runtime support directories:",
    `- ${runtimeSupport.mirror_home}`,
    `- ${runtimeSupport.lore_scrolls}`,
    `- ${runtimeSupport.logs}`,
    `- ${runtimeSupport.cache}`,
  );

  if (installedService) {
    lines.push(
      "",
      "Installed service:",
      `- unit: ${installedService.unitPath}`,
      `- exec: ${installedService.execStart}`,
      `- daemon-reload: ${
        installedService.daemonReloaded === null
          ? "skipped (no user bus)"
          : installedService.daemonReloaded
            ? "done"
            : "not run"
      }`,
    );
  }

  lines.push(
    "",
    "Next commands:",
    "- mirror start",
    "- mirror status",
    "- mirror console",
    ...(installService
      ? [
          "- systemctl --user enable mirror-runtime.service",
          "- systemctl --user start mirror-runtime.service",
        ]
      : []),
  );

  const output = `${lines.join("\n")}\n`;
  if (!options.yes) {
    outro("Mirror onboarding complete");
  }
  return output;
}
