import type { MirrorChatResponse } from "../mirror-runtime/index.js";
import type { MirrorService } from "../mirror-service/index.js";
import type {
  MirrorCliActionName,
  MirrorCliCommandName,
  MirrorCliCommandResult,
} from "./commands.js";

export type MirrorCliJsonError = {
  ok: false;
  command: MirrorCliCommandName | null;
  action?: MirrorCliActionName;
  error: string;
};

export type MirrorCliJsonChat = {
  ok: true;
  command: "chat";
  response: string;
  model: string;
  usage?: MirrorChatResponse["usage"];
};

export type MirrorCliJsonFind = {
  ok: true;
  command: "find";
  results: unknown[];
  diagnostics?: Record<string, unknown>;
};

export type MirrorCliJsonFact = {
  ok: true;
  command: "fact";
  canonical_fact: string;
  source: {
    scroll_id: string;
    title: string;
    path: string;
  };
  diagnostics?: Record<string, unknown>;
  supersession_note?: string;
  fact_update_reference?: string;
};

export type MirrorCliJsonInterpret = {
  ok: true;
  command: "interpret";
  interpretation: Record<string, unknown>;
};

export type MirrorCliJsonForge = {
  ok: true;
  command: "forge";
  draft: Record<string, unknown>;
};

export type MirrorCliJsonCommit = {
  ok: true;
  command: "commit";
  commit_result: Record<string, unknown>;
};

export type MirrorCliJsonStatus = {
  ok: true;
  command: "status";
  status: Record<string, unknown>;
};

export type MirrorCliJsonDoctor = {
  ok: true;
  command: "doctor";
  report: {
    ts: string;
    overall: string;
    checks: Array<{
      key: string;
      status: string;
      message: string;
      details?: Record<string, unknown>;
    }>;
  };
};

export type MirrorCliJsonVerifyLore = {
  ok: true;
  command: "verify-lore";
  verification: {
    manifest_path: string;
    directory: string;
    ok: boolean;
    checked: number;
    matched: number;
    missing: string[];
    mismatched: Array<Record<string, unknown>>;
  };
};

export type MirrorCliJsonServe = {
  ok: true;
  command: "serve";
  service: {
    port: number;
    lore_dir: string;
    provider_url: string;
    node_id: string;
    base_url: string | null;
  };
};

export type MirrorCliJsonSync = {
  ok: true;
  command: "sync";
  action: MirrorCliActionName;
  peers?: unknown[];
  updates?: Record<string, unknown>;
  pull_result?: Record<string, unknown>;
  local?: Record<string, unknown>;
  peer?: Record<string, unknown>;
};

export type MirrorCliJsonTask = {
  ok: true;
  command: "task";
  action: MirrorCliActionName;
  task?: Record<string, unknown>;
  tasks?: unknown[];
  deleted?: boolean;
  task_id?: string;
};

export type MirrorCliJsonReminder = {
  ok: true;
  command: "reminder";
  action: MirrorCliActionName;
  reminder?: Record<string, unknown>;
  reminders?: unknown[];
  deleted?: boolean;
  reminder_id?: string;
};

export type MirrorCliJsonHeartbeat = {
  ok: true;
  command: "heartbeat";
  action: MirrorCliActionName;
  heartbeat?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  suggested_message?: string;
  suggested_tone?: string;
};

export type MirrorCliJsonMonk = {
  ok: true;
  command: "monk";
  action: MirrorCliActionName;
  context?: Record<string, unknown>;
  resume_context?: Record<string, unknown>;
  action_result?: Record<string, unknown>;
  actions?: unknown[];
  note?: Record<string, unknown>;
};

export type MirrorCliJsonSuccess =
  | MirrorCliJsonChat
  | MirrorCliJsonFind
  | MirrorCliJsonFact
  | MirrorCliJsonInterpret
  | MirrorCliJsonForge
  | MirrorCliJsonCommit
  | MirrorCliJsonStatus
  | MirrorCliJsonDoctor
  | MirrorCliJsonVerifyLore
  | MirrorCliJsonServe
  | MirrorCliJsonSync
  | MirrorCliJsonTask
  | MirrorCliJsonReminder
  | MirrorCliJsonHeartbeat
  | MirrorCliJsonMonk;

export type MirrorCliJsonOutput = MirrorCliJsonSuccess | MirrorCliJsonError;

export type MirrorCliCommandHelp = {
  command: MirrorCliCommandName;
  usage: string;
  description: string;
  args: string[];
  options: string[];
  auth: "open" | "operator";
};

export const MIRROR_CLI_COMMAND_HELP: MirrorCliCommandHelp[] = [
  {
    command: "chat",
    usage:
      "mirror chat [--model <model>] [--provider-url <url>] [--provider-token <token>] [--user-id <id>] [--json] <text>",
    description: "Run canon-first chat through the Mirror Chat Engine and provider runtime.",
    args: ["<text>: required user prompt"],
    options: [
      "--model <model>: optional model id (default: mirror-default)",
      "--provider-url <url>: override the configured provider URL",
      "--provider-token <token>: override the configured provider token",
      "--user-id <id>: optional retrieval/memory user id",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "find",
    usage: "mirror find [--json] <query>",
    description: "Find canonical scroll candidates for a query.",
    args: ["<query>: required canon search query"],
    options: ["--json: emit stable machine-readable JSON"],
    auth: "open",
  },
  {
    command: "fact",
    usage: "mirror fact [--json] <query>",
    description: "Resolve a canon-first fact statement for a query.",
    args: ["<query>: required fact query"],
    options: ["--json: emit stable machine-readable JSON"],
    auth: "open",
  },
  {
    command: "interpret",
    usage:
      "mirror interpret [--date <date>] [--source-ref <ref>] [--family <L|QA|C>] [--operator-token <token>] [--json] <tweet_text>",
    description: "Interpret raw source text into a forge-ready canon authoring plan.",
    args: ["<tweet_text>: required source text"],
    options: [
      "--date <date>: optional observed date",
      "--source-ref <ref>: optional source reference",
      "--family <L|QA|C>: optional preferred family",
      "--operator-token <token>: operator auth token override",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "operator",
  },
  {
    command: "forge",
    usage:
      "mirror forge --title <title> --family <L|QA|C> [--operator-token <token>] [--json] <narrative>",
    description: "Generate a canonical scroll draft template.",
    args: ["<narrative>: required draft narrative text"],
    options: [
      "--title <title>: required draft title",
      "--family <L|QA|C>: required target family",
      "--operator-token <token>: operator auth token override",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "operator",
  },
  {
    command: "commit",
    usage:
      "mirror commit [--filename <name>] [--family <L|QA|C>] [--dry-run] [--force] [--operator-token <token>] [--json] <draft>",
    description: "Validate, review, and commit a canonical scroll draft.",
    args: ["<draft>: required full draft markdown"],
    options: [
      "--filename <name>: optional filename hint",
      "--family <L|QA|C>: optional family override",
      "--dry-run: validate and review without writing",
      "--force: operator-only conflict override",
      "--operator-token <token>: operator auth token override",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "operator",
  },
  {
    command: "status",
    usage: "mirror status [--json]",
    description: "Show the daemon-backed standalone Mirror runtime status snapshot.",
    args: [],
    options: ["--json: emit stable machine-readable JSON"],
    auth: "open",
  },
  {
    command: "doctor",
    usage: "mirror doctor [--json]",
    description: "Run diagnostic checks on the Mirror runtime and environment.",
    args: [],
    options: ["--json: emit stable machine-readable JSON"],
    auth: "open",
  },
  {
    command: "verify-lore",
    usage: "mirror verify-lore [--manifest <path>] [--dir <path>] [--json]",
    description: "Verify canonical lore files against a lore manifest.",
    args: [],
    options: [
      "--manifest <path>: lore manifest path (default: <resolved lore dir>/manifest.json)",
      "--dir <path>: canonical lore directory (default: MIRROR_LORE_DIR or ./lore-scrolls)",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "serve",
    usage: "mirror serve [--port <n>] [--json]",
    description: "Start the Mirror service with canonical Mirror routes.",
    args: [],
    options: [
      "--port <n>: optional service port override",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "sync",
    usage: "mirror sync <peers|updates|announce|pull> [--service-url <url>] [options] [--json]",
    description: "Operate the standalone Mirror sync surface through the running Mirror service.",
    args: ["subcommands: peers, updates, announce, pull"],
    options: [
      "--service-url <url>: override MIRROR_SERVICE_URL or MIRROR_BASE_URL",
      "--peer-id <id>: peer identifier for announce or pull",
      "--base-url <url>: peer base url for announce or pull",
      "--paths <a,b>: optional canon paths to include when reading updates",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "task",
    usage: "mirror task <create|list|update|complete|delete> --user-id <id> [options] [--json]",
    description: "Manage personal workspace tasks through the Mirror tool registry.",
    args: ["subcommands: create, list, update, complete, delete"],
    options: [
      "--user-id <id>: required workspace user id unless MIRROR_USER_ID is set",
      "--title <text>: task create/update title",
      "--description <text>: task create/update description",
      "--due-at <iso>: task create/update due timestamp",
      "--status <active|paused|done>: task update status",
      "--tags <a,b>: optional comma-separated tags",
      "--related-draft-id <id>: optional related draft id",
      "--id <task_id>: required for update/complete/delete",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "reminder",
    usage:
      "mirror reminder <create|list|update|delete|enable|disable|due> --user-id <id> [options] [--json]",
    description: "Manage personal workspace reminders through the Mirror tool registry.",
    args: ["subcommands: create, list, update, delete, enable, disable, due"],
    options: [
      "--user-id <id>: required workspace user id unless MIRROR_USER_ID is set",
      "--title <text>: reminder create/update title",
      "--message <text>: reminder create/update message",
      "--remind-at <iso>: reminder timestamp",
      "--recurrence <none|daily|weekly>: reminder recurrence",
      "--related-task-id <id>: optional related task id",
      "--tags <a,b>: optional comma-separated tags",
      "--id <reminder_id>: required for update/delete/enable/disable",
      "--now <iso>: optional evaluation time for due",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "heartbeat",
    usage: "mirror heartbeat <get|update|record-seen|evaluate> --user-id <id> [options] [--json]",
    description: "Inspect and update opt-in heartbeat state through the Mirror tool registry.",
    args: ["subcommands: get, update, record-seen, evaluate"],
    options: [
      "--user-id <id>: required workspace user id unless MIRROR_USER_ID is set",
      "--enabled <true|false>: heartbeat opt-in flag for update",
      "--check-in-after-days <n>: inactivity threshold for update",
      "--quiet-mode <true|false>: quiet mode flag for update",
      "--tone <gentle|calm|steady>: heartbeat tone for update",
      "--opt-in-source <text>: optional opt-in metadata",
      "--seen-at <iso>: optional timestamp for record-seen",
      "--now <iso>: optional evaluation time for evaluate",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
  {
    command: "monk",
    usage:
      "mirror monk <context|next|open-work|reminders|resume|followup-task|followup-reminder|note|record-action> --user-id <id> [options] [--json]",
    description: "Access Monk task-aware assistance through the Mirror tool registry.",
    args: [
      "subcommands: context, next, open-work, reminders, resume, followup-task, followup-reminder, note, record-action",
    ],
    options: [
      "--user-id <id>: required workspace user id unless MIRROR_USER_ID is set",
      "--now <iso>: optional evaluation timestamp for context/open-work/reminders/resume/followup-reminder",
      "--task-id <id>: required for followup-task and optional for record-action",
      "--reminder-id <id>: required for followup-reminder and optional for record-action",
      "--note <text>: required for monk note",
      "--kind <name>: required for record-action",
      "--source <name>: required for record-action",
      "--summary <text>: required for record-action",
      "--suggested-action <text>: required for record-action",
      "--draft-id <id>: optional for record-action",
      "--context-notes <a,b>: optional comma-separated context notes for record-action",
      "--json: emit stable machine-readable JSON",
    ],
    auth: "open",
  },
];

export type MirrorCliResultContext = {
  result: MirrorCliCommandResult;
  service?: MirrorService;
};
