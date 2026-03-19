import { readFile } from "node:fs/promises";
import {
  buildCliChatAdapterEnvelope,
  buildCliToolAdapterEnvelope,
} from "../mirror-adapters/index.js";
import { authorizeMirrorToolRequest } from "../mirror-gateway/auth.js";
import type { MirrorGateway } from "../mirror-gateway/index.js";
import type { MirrorProviderConfig } from "../mirror-provider/index.js";
import type { MirrorChatResponse } from "../mirror-runtime/index.js";
import type { MirrorRuntimeHost, MirrorService } from "../mirror-service/index.js";
import { runMirrorDoctor, type MirrorDoctorReport } from "../mirror/doctor/index.js";
import {
  resolveDefaultLoreManifestPath,
  verifyLoreManifest,
} from "../mirror/lore_manifest/index.js";
import type { MirrorLoreManifest } from "../mirror/lore_manifest/types.js";
import { resolveDefaultLoreRoot } from "../mirror/lore_sources/index.js";
import { getMirrorStatus } from "../mirror/status/status.js";

export type MirrorCliCommandName =
  | "chat"
  | "find"
  | "fact"
  | "interpret"
  | "forge"
  | "commit"
  | "status"
  | "doctor"
  | "verify-lore"
  | "serve"
  | "sync"
  | "task"
  | "reminder"
  | "heartbeat"
  | "monk";

export type MirrorCliActionName =
  | "create"
  | "list"
  | "update"
  | "complete"
  | "delete"
  | "enable"
  | "disable"
  | "due"
  | "get"
  | "record-seen"
  | "evaluate"
  | "context"
  | "next"
  | "open-work"
  | "reminders"
  | "resume"
  | "followup-task"
  | "followup-reminder"
  | "note"
  | "record-action"
  | "peers"
  | "updates"
  | "announce"
  | "pull";

export type MirrorCliParsedArgs = {
  command: MirrorCliCommandName;
  action?: MirrorCliActionName;
  positional: string[];
  flags: Record<string, string | boolean>;
  json: boolean;
};

export type MirrorCliCommandResult =
  | { kind: "chat"; command: "chat"; response: MirrorChatResponse }
  | { kind: "status"; command: "status"; status: Awaited<ReturnType<typeof getMirrorStatus>> }
  | { kind: "doctor"; command: "doctor"; report: MirrorDoctorReport }
  | {
      kind: "verify-lore";
      command: "verify-lore";
      verification: {
        manifest_path: string;
        directory: string;
        ok: boolean;
        checked: number;
        matched: number;
        missing: string[];
        mismatched: Array<{ path: string; expected: string; actual: string }>;
      };
    }
  | {
      kind: "tool";
      command: Exclude<MirrorCliCommandName, "chat" | "serve">;
      action?: MirrorCliActionName;
      tool: string;
      result: Record<string, unknown>;
    }
  | { kind: "serve"; command: "serve"; service: MirrorService };

const COMMANDS = new Set<MirrorCliCommandName>([
  "chat",
  "find",
  "fact",
  "interpret",
  "forge",
  "commit",
  "status",
  "doctor",
  "verify-lore",
  "serve",
  "sync",
  "task",
  "reminder",
  "heartbeat",
  "monk",
]);

const UTILITY_ACTIONS: Record<
  "sync" | "task" | "reminder" | "heartbeat" | "monk",
  MirrorCliActionName[]
> = {
  sync: ["peers", "updates", "announce", "pull"],
  task: ["create", "list", "update", "complete", "delete"],
  reminder: ["create", "list", "update", "delete", "enable", "disable", "due"],
  heartbeat: ["get", "update", "record-seen", "evaluate"],
  monk: [
    "context",
    "next",
    "open-work",
    "reminders",
    "resume",
    "followup-task",
    "followup-reminder",
    "note",
    "record-action",
  ],
};

const TOOL_BY_COMMAND: Record<
  Exclude<
    MirrorCliCommandName,
    "chat" | "serve" | "sync" | "task" | "reminder" | "heartbeat" | "monk"
  >,
  string
> = {
  find: "mirror.find-scroll",
  fact: "mirror.canon-fact",
  interpret: "mirror.interpret-tweet",
  forge: "mirror.forge-scroll",
  commit: "mirror.commit-scroll",
  status: "mirror.status",
  doctor: "mirror.doctor",
  "verify-lore": "mirror.verify-lore",
};

const UTILITY_TOOL_BY_ACTION = {
  task: {
    create: "mirror.task.create",
    list: "mirror.task.list",
    update: "mirror.task.update",
    complete: "mirror.task.complete",
    delete: "mirror.task.delete",
  },
  reminder: {
    create: "mirror.reminder.create",
    list: "mirror.reminder.list",
    update: "mirror.reminder.update",
    delete: "mirror.reminder.delete",
    enable: "mirror.reminder.enable",
    disable: "mirror.reminder.disable",
    due: "mirror.reminder.due",
  },
  heartbeat: {
    get: "mirror.heartbeat.get",
    update: "mirror.heartbeat.update",
    "record-seen": "mirror.heartbeat.record-seen",
    evaluate: "mirror.heartbeat.evaluate",
  },
  monk: {
    context: "mirror.monk.context",
    next: "mirror.monk.next-task",
    "open-work": "mirror.monk.open-work",
    reminders: "mirror.monk.due-reminders",
    resume: "mirror.monk.resume",
    "followup-task": "mirror.monk.followup-task",
    "followup-reminder": "mirror.monk.followup-reminder",
    note: "mirror.monk.note",
    "record-action": "mirror.monk.record-action",
  },
} as const;

function looksLikeLongFlag(value: string): boolean {
  return /^--[a-z0-9][a-z0-9-]*$/i.test(value);
}

function getFlagValue(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function getBooleanFlag(flags: Record<string, string | boolean>, key: string): boolean | undefined {
  const value = flags[key];
  return typeof value === "boolean" ? value : undefined;
}

function parseBooleanish(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
}

function parseInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`mirror ${label} requires an integer value`);
  }
  return parsed;
}

function parseTags(flags: Record<string, string | boolean>): string[] | undefined {
  const raw = getFlagValue(flags, "tags");
  if (!raw) {
    return undefined;
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function buildCliRequestToken(flags: Record<string, string | boolean>): string | undefined {
  const explicit = getFlagValue(flags, "operator-token");
  if (explicit) {
    return explicit;
  }
  const envToken = process.env.MIRROR_OPERATOR_TOKEN;
  return typeof envToken === "string" && envToken.trim().length > 0 ? envToken.trim() : undefined;
}

function resolveUserId(flags: Record<string, string | boolean>): string | undefined {
  const explicit = getFlagValue(flags, "user-id");
  if (explicit) {
    return explicit;
  }
  const envUserId = process.env.MIRROR_USER_ID;
  return typeof envUserId === "string" && envUserId.trim().length > 0
    ? envUserId.trim()
    : undefined;
}

function requireUserId(flags: Record<string, string | boolean>, label: string): string {
  const userId = resolveUserId(flags);
  if (!userId) {
    throw new Error(`mirror ${label} requires --user-id or MIRROR_USER_ID`);
  }
  return userId;
}

function authorizeToolOrThrow(
  gateway: MirrorGateway,
  toolName: string,
  flags: Record<string, string | boolean>,
): void {
  const tool = gateway.registry.getTool(toolName);
  if (!tool) {
    throw new Error(`Unknown Mirror tool: ${toolName}`);
  }

  const token = buildCliRequestToken(flags);
  const decision = authorizeMirrorToolRequest(
    {
      header(name: string) {
        if (name.toLowerCase() === "x-mirror-operator-token") {
          return token;
        }
        if (name.toLowerCase() === "authorization" && token) {
          return `Bearer ${token}`;
        }
        return undefined;
      },
    } as never,
    tool,
  );

  if (!decision.allowed) {
    throw new Error(decision.error ?? "Mirror operator authorization required");
  }
}

function buildProviderConfig(
  flags: Record<string, string | boolean>,
  fallback?: MirrorProviderConfig,
): MirrorProviderConfig {
  const url =
    getFlagValue(flags, "provider-url") ?? process.env.MIRROR_PROVIDER_URL ?? fallback?.url;
  const authToken =
    getFlagValue(flags, "provider-token") ??
    process.env.MIRROR_PROVIDER_AUTH_TOKEN ??
    fallback?.authToken;

  if (!url) {
    throw new Error("Mirror provider url not configured");
  }
  if (!authToken) {
    throw new Error("Mirror provider auth token not configured");
  }

  return {
    url,
    authToken,
    timeoutMs: fallback?.timeoutMs,
  };
}

async function executeCliToolViaAdapter(params: {
  runtimeHost: MirrorRuntimeHost;
  tool: string;
  payload: Record<string, unknown>;
  userId?: string;
  operatorToken?: string;
  command: MirrorCliCommandName;
  action?: MirrorCliActionName;
}): Promise<Record<string, unknown>> {
  const response = await params.runtimeHost.executeAdapterRequest(
    buildCliToolAdapterEnvelope({
      toolName: params.tool,
      input: params.payload,
      userId: params.userId,
      operatorToken: params.operatorToken ?? null,
      command: params.command,
      action: params.action,
    }),
  );
  if (response.kind !== "tool.response") {
    throw new Error(`Unexpected Mirror adapter response kind: ${response.kind}`);
  }
  return response.response.result;
}

function parseJsonFlag(flags: Record<string, string | boolean>): boolean {
  return flags.json === true;
}

export function parseMirrorCliArgs(argv: string[]): MirrorCliParsedArgs {
  const args = [...argv];
  if (args[0] === "mirror") {
    args.shift();
  }

  const commandRaw = args.shift();
  if (!commandRaw || !COMMANDS.has(commandRaw as MirrorCliCommandName)) {
    throw new Error(
      "Mirror CLI requires one of: chat, find, fact, interpret, forge, commit, status, verify-lore, serve, sync, task, reminder, heartbeat, monk",
    );
  }

  let action: MirrorCliActionName | undefined;
  if (
    commandRaw === "sync" ||
    commandRaw === "task" ||
    commandRaw === "reminder" ||
    commandRaw === "heartbeat" ||
    commandRaw === "monk"
  ) {
    const actionRaw = args.shift();
    if (!actionRaw || !UTILITY_ACTIONS[commandRaw].includes(actionRaw as MirrorCliActionName)) {
      throw new Error(
        `mirror ${commandRaw} requires one of: ${UTILITY_ACTIONS[commandRaw].join(", ")}`,
      );
    }
    action = actionRaw as MirrorCliActionName;
  }

  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index] ?? "";
    if (!looksLikeLongFlag(current)) {
      positional.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = args[index + 1];
    if (next !== undefined && !looksLikeLongFlag(next)) {
      flags[key] = next;
      index += 1;
      continue;
    }
    flags[key] = true;
  }

  return {
    command: commandRaw as MirrorCliCommandName,
    action,
    positional,
    flags,
    json: parseJsonFlag(flags),
  };
}

function requireText(value: string | undefined, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`mirror ${label} requires input`);
  }
  return value.trim();
}

async function executeLegacyToolCommand(
  runtimeHost: MirrorRuntimeHost,
  command: Exclude<
    MirrorCliCommandName,
    "chat" | "serve" | "sync" | "task" | "reminder" | "heartbeat" | "monk"
  >,
  flags: Record<string, string | boolean>,
  positional: string[],
): Promise<MirrorCliCommandResult> {
  const tool = TOOL_BY_COMMAND[command];
  authorizeToolOrThrow(runtimeHost.gateway, tool, flags);

  let payload: Record<string, unknown> = {};
  switch (command) {
    case "find":
      payload = { query: requireText(positional.join(" "), "find") };
      break;
    case "fact":
      payload = { query: requireText(positional.join(" "), "fact") };
      break;
    case "interpret":
      payload = {
        tweet_text: requireText(positional.join(" "), "interpret"),
        date: getFlagValue(flags, "date"),
        source_ref: getFlagValue(flags, "source-ref"),
        preferred_family: getFlagValue(flags, "family"),
      };
      break;
    case "forge":
      payload = {
        title: requireText(getFlagValue(flags, "title"), "forge --title"),
        category: requireText(getFlagValue(flags, "family"), "forge --family"),
        narrative: requireText(positional.join(" "), "forge narrative"),
      };
      break;
    case "commit":
      payload = {
        draft_scroll_content: requireText(positional.join(" "), "commit draft"),
        preferred_filename: getFlagValue(flags, "filename"),
        family_override: getFlagValue(flags, "family"),
        dry_run: getBooleanFlag(flags, "dry-run"),
        force: getBooleanFlag(flags, "force"),
      };
      break;
    case "status":
    case "verify-lore":
      break;
  }

  const adapterResult = await executeCliToolViaAdapter({
    runtimeHost,
    tool,
    payload,
    userId: typeof payload.user_id === "string" ? payload.user_id : undefined,
    operatorToken: buildCliRequestToken(flags),
    command,
  });
  return {
    kind: "tool",
    command,
    tool,
    result: adapterResult,
  };
}

async function executeSyncCommand(
  runtimeHost: MirrorRuntimeHost,
  action: MirrorCliActionName,
  flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  let result: Record<string, unknown>;
  switch (action) {
    case "peers":
      result = await runtimeHost.executeSyncAction("peers");
      break;
    case "updates": {
      const paths = getFlagValue(flags, "paths");
      result = await runtimeHost.executeSyncAction("updates", {
        requested_paths: paths
          ? paths
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          : [],
      });
      break;
    }
    case "announce":
      result = await runtimeHost.executeSyncAction("announce", {
        peer_id: requireText(getFlagValue(flags, "peer-id"), "sync announce --peer-id"),
        base_url: requireText(getFlagValue(flags, "base-url"), "sync announce --base-url"),
      });
      break;
    case "pull":
      result = await runtimeHost.executeSyncAction("pull", {
        peer_id: getFlagValue(flags, "peer-id"),
        base_url: getFlagValue(flags, "base-url"),
      });
      break;
    default:
      throw new Error(`Unsupported mirror sync action: ${action}`);
  }

  return {
    kind: "tool",
    command: "sync",
    action,
    tool: `mirror.sync.${action}`,
    result,
  };
}

async function executeStatusCommand(
  runtimeHost: MirrorRuntimeHost,
  _flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const status = await getMirrorStatus({
    runtimeHost,
  });
  return {
    kind: "status",
    command: "status",
    status,
  };
}

async function executeVerifyLoreCommand(
  flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const directory = getFlagValue(flags, "dir") ?? resolveDefaultLoreRoot();
  const manifestPath = getFlagValue(flags, "manifest") ?? resolveDefaultLoreManifestPath(directory);
  const manifestRaw = await readFile(manifestPath, "utf8");

  let manifest: MirrorLoreManifest;
  try {
    manifest = JSON.parse(manifestRaw) as MirrorLoreManifest;
  } catch (error) {
    throw new Error(`Invalid lore manifest JSON at ${manifestPath}: ${(error as Error).message}`, {
      cause: error,
    });
  }

  const report = await verifyLoreManifest({
    manifest,
    baseDir: directory,
  });

  return {
    kind: "verify-lore",
    command: "verify-lore",
    verification: {
      manifest_path: manifestPath,
      directory,
      ...report,
    },
  };
}

async function executeTaskCommand(
  runtimeHost: MirrorRuntimeHost,
  action: MirrorCliActionName,
  flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const tool = UTILITY_TOOL_BY_ACTION.task[action as keyof typeof UTILITY_TOOL_BY_ACTION.task];
  if (!tool) {
    throw new Error(`Unsupported mirror task action: ${action}`);
  }
  authorizeToolOrThrow(runtimeHost.gateway, tool, flags);

  const userId = requireUserId(flags, `task ${action}`);
  const payload: Record<string, unknown> = { user_id: userId };
  if (action === "create") {
    payload.title = requireText(getFlagValue(flags, "title"), "task create --title");
    payload.description = getFlagValue(flags, "description");
    payload.due_at = getFlagValue(flags, "due-at");
    payload.tags = parseTags(flags);
    payload.related_draft_id = getFlagValue(flags, "related-draft-id");
  }
  if (action === "update") {
    payload.task_id = requireText(getFlagValue(flags, "id"), "task update --id");
    payload.title = getFlagValue(flags, "title");
    payload.description = getFlagValue(flags, "description");
    payload.status = getFlagValue(flags, "status");
    payload.due_at = getFlagValue(flags, "due-at");
    payload.tags = parseTags(flags);
    payload.related_draft_id = getFlagValue(flags, "related-draft-id");
  }
  if (action === "complete" || action === "delete") {
    payload.task_id = requireText(getFlagValue(flags, "id"), `task ${action} --id`);
  }

  const result = await executeCliToolViaAdapter({
    runtimeHost,
    tool,
    payload,
    userId,
    operatorToken: buildCliRequestToken(flags),
    command: "task",
    action,
  });
  return { kind: "tool", command: "task", action, tool, result };
}

async function executeReminderCommand(
  runtimeHost: MirrorRuntimeHost,
  action: MirrorCliActionName,
  flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const tool =
    UTILITY_TOOL_BY_ACTION.reminder[action as keyof typeof UTILITY_TOOL_BY_ACTION.reminder];
  if (!tool) {
    throw new Error(`Unsupported mirror reminder action: ${action}`);
  }
  authorizeToolOrThrow(runtimeHost.gateway, tool, flags);

  const userId = requireUserId(flags, `reminder ${action}`);
  const payload: Record<string, unknown> = { user_id: userId };
  if (action === "create") {
    payload.title = requireText(getFlagValue(flags, "title"), "reminder create --title");
    payload.message = getFlagValue(flags, "message");
    payload.remind_at = getFlagValue(flags, "remind-at");
    payload.recurrence = getFlagValue(flags, "recurrence");
    payload.related_task_id = getFlagValue(flags, "related-task-id");
    payload.tags = parseTags(flags);
  }
  if (action === "update") {
    payload.reminder_id = requireText(getFlagValue(flags, "id"), "reminder update --id");
    payload.title = getFlagValue(flags, "title");
    payload.message = getFlagValue(flags, "message");
    payload.status = getFlagValue(flags, "status");
    payload.remind_at = getFlagValue(flags, "remind-at");
    payload.recurrence = getFlagValue(flags, "recurrence");
    payload.related_task_id = getFlagValue(flags, "related-task-id");
    payload.tags = parseTags(flags);
  }
  if (action === "delete" || action === "enable" || action === "disable") {
    payload.reminder_id = requireText(getFlagValue(flags, "id"), `reminder ${action} --id`);
  }
  if (action === "due") {
    payload.now = getFlagValue(flags, "now");
  }

  const result = await executeCliToolViaAdapter({
    runtimeHost,
    tool,
    payload,
    userId,
    operatorToken: buildCliRequestToken(flags),
    command: "reminder",
    action,
  });
  return { kind: "tool", command: "reminder", action, tool, result };
}

async function executeHeartbeatCommand(
  runtimeHost: MirrorRuntimeHost,
  action: MirrorCliActionName,
  flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const tool =
    UTILITY_TOOL_BY_ACTION.heartbeat[action as keyof typeof UTILITY_TOOL_BY_ACTION.heartbeat];
  if (!tool) {
    throw new Error(`Unsupported mirror heartbeat action: ${action}`);
  }
  authorizeToolOrThrow(runtimeHost.gateway, tool, flags);

  const userId = requireUserId(flags, `heartbeat ${action}`);
  const payload: Record<string, unknown> = { user_id: userId };
  if (action === "update") {
    payload.enabled = parseBooleanish(flags.enabled);
    payload.check_in_after_inactivity_days = parseInteger(
      getFlagValue(flags, "check-in-after-days"),
      "heartbeat update --check-in-after-days",
    );
    payload.quiet_mode = parseBooleanish(flags["quiet-mode"]);
    payload.preferred_tone = getFlagValue(flags, "tone");
    payload.opt_in_source = getFlagValue(flags, "opt-in-source");
  }
  if (action === "record-seen") {
    payload.seen_at = getFlagValue(flags, "seen-at");
  }
  if (action === "evaluate") {
    payload.now = getFlagValue(flags, "now");
  }

  const result = await executeCliToolViaAdapter({
    runtimeHost,
    tool,
    payload,
    userId,
    operatorToken: buildCliRequestToken(flags),
    command: "heartbeat",
    action,
  });
  return { kind: "tool", command: "heartbeat", action, tool, result };
}

async function executeMonkCommand(
  runtimeHost: MirrorRuntimeHost,
  action: MirrorCliActionName,
  flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const tool = UTILITY_TOOL_BY_ACTION.monk[action as keyof typeof UTILITY_TOOL_BY_ACTION.monk];
  if (!tool) {
    throw new Error(`Unsupported mirror monk action: ${action}`);
  }
  authorizeToolOrThrow(runtimeHost.gateway, tool, flags);

  const userId = requireUserId(flags, `monk ${action}`);
  const payload: Record<string, unknown> = { user_id: userId };
  if (
    action === "context" ||
    action === "open-work" ||
    action === "reminders" ||
    action === "resume"
  ) {
    payload.now = getFlagValue(flags, "now");
  }
  if (action === "followup-task") {
    payload.task_id = requireText(getFlagValue(flags, "task-id"), "monk followup-task --task-id");
  }
  if (action === "followup-reminder") {
    payload.reminder_id = requireText(
      getFlagValue(flags, "reminder-id"),
      "monk followup-reminder --reminder-id",
    );
    payload.now = getFlagValue(flags, "now");
  }
  if (action === "note") {
    payload.note = requireText(getFlagValue(flags, "note"), "monk note --note");
  }
  if (action === "record-action") {
    payload.kind = requireText(getFlagValue(flags, "kind"), "monk record-action --kind");
    payload.source = requireText(getFlagValue(flags, "source"), "monk record-action --source");
    payload.summary = requireText(getFlagValue(flags, "summary"), "monk record-action --summary");
    payload.suggested_action = requireText(
      getFlagValue(flags, "suggested-action"),
      "monk record-action --suggested-action",
    );
    payload.related_task_id = getFlagValue(flags, "task-id");
    payload.related_reminder_id = getFlagValue(flags, "reminder-id");
    payload.related_draft_id = getFlagValue(flags, "draft-id");
    payload.context_notes = parseTags({ tags: flags["context-notes"] ?? flags.tags });
  }

  const result = await executeCliToolViaAdapter({
    runtimeHost,
    tool,
    payload,
    userId,
    operatorToken: buildCliRequestToken(flags),
    command: "monk",
    action,
  });
  return { kind: "tool", command: "monk", action, tool, result };
}

async function executeDoctorCommand(
  _flags: Record<string, string | boolean>,
): Promise<MirrorCliCommandResult> {
  const report = await runMirrorDoctor();
  return {
    kind: "doctor",
    command: "doctor",
    report,
  };
}

export async function executeMirrorCliCommand(
  parsed: MirrorCliParsedArgs,
  deps: {
    gateway: MirrorGateway;
    runtimeHost: MirrorRuntimeHost;
    provider?: MirrorProviderConfig;
    fetchImpl?: typeof fetch;
    startService?: (opts: { port?: number }) => Promise<MirrorService>;
  },
): Promise<MirrorCliCommandResult> {
  if (parsed.command === "serve") {
    if (!deps.startService) {
      throw new Error("Mirror service starter is not configured");
    }
    const portRaw = getFlagValue(parsed.flags, "port");
    const port = portRaw !== undefined ? Number.parseInt(portRaw, 10) : undefined;
    return {
      kind: "serve",
      command: "serve",
      service: await deps.startService({ port }),
    };
  }

  if (parsed.command === "sync") {
    return executeSyncCommand(deps.runtimeHost, parsed.action as MirrorCliActionName, parsed.flags);
  }

  if (parsed.command === "status") {
    return executeStatusCommand(deps.runtimeHost, parsed.flags);
  }

  if (parsed.command === "doctor") {
    return executeDoctorCommand(parsed.flags);
  }

  if (parsed.command === "verify-lore") {
    return executeVerifyLoreCommand(parsed.flags);
  }

  if (parsed.command === "chat") {
    const message = requireText(parsed.positional.join(" "), "chat");
    const provider = buildProviderConfig(parsed.flags, deps.provider);
    const adapterResponse = await deps.runtimeHost.executeAdapterRequest(
      buildCliChatAdapterEnvelope({
        model: getFlagValue(parsed.flags, "model") ?? "mirror-default",
        messages: [{ role: "user", content: message }],
        userId: resolveUserId(parsed.flags),
        command: "chat",
        preferredProvider: provider.url,
      }),
      { provider, fetchImpl: deps.fetchImpl },
    );
    if (adapterResponse.kind !== "chat.response") {
      throw new Error(`Unexpected Mirror adapter response kind: ${adapterResponse.kind}`);
    }
    return {
      kind: "chat",
      command: "chat",
      response: adapterResponse.response,
    };
  }

  if (
    parsed.command === "find" ||
    parsed.command === "fact" ||
    parsed.command === "interpret" ||
    parsed.command === "forge" ||
    parsed.command === "commit"
  ) {
    return executeLegacyToolCommand(
      deps.runtimeHost,
      parsed.command,
      parsed.flags,
      parsed.positional,
    );
  }

  if (parsed.command === "task") {
    return executeTaskCommand(deps.runtimeHost, parsed.action as MirrorCliActionName, parsed.flags);
  }
  if (parsed.command === "reminder") {
    return executeReminderCommand(
      deps.runtimeHost,
      parsed.action as MirrorCliActionName,
      parsed.flags,
    );
  }
  if (parsed.command === "heartbeat") {
    return executeHeartbeatCommand(
      deps.runtimeHost,
      parsed.action as MirrorCliActionName,
      parsed.flags,
    );
  }
  return executeMonkCommand(deps.runtimeHost, parsed.action as MirrorCliActionName, parsed.flags);
}
