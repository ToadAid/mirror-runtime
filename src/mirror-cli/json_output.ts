import type {
  MirrorCliActionName,
  MirrorCliCommandName,
  MirrorCliCommandResult,
} from "./commands.js";
import type { MirrorCliJsonOutput } from "./schemas.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toMirrorCliJsonOutput(result: MirrorCliCommandResult): MirrorCliJsonOutput {
  if (result.kind === "chat") {
    return {
      ok: true,
      command: "chat",
      response: result.response.choices[0]?.message.content ?? "",
      model: result.response.model,
      usage: result.response.usage,
    };
  }

  if (result.kind === "serve") {
    return {
      ok: true,
      command: "serve",
      service: {
        port: result.service.port,
        lore_dir: result.service.config.loreDir,
        provider_url: result.service.config.providerUrl,
        node_id: result.service.config.nodeId,
        base_url: result.service.syncManager.getLocalBaseUrl(),
      },
    };
  }

  if (result.kind === "status") {
    return {
      ok: true,
      command: "status",
      status: result.status,
    };
  }

  if (result.kind === "verify-lore") {
    return {
      ok: true,
      command: "verify-lore",
      verification: result.verification,
    };
  }

  const payload = asRecord(result.result);

  switch (result.command) {
    case "sync":
      return {
        ok: true,
        command: "sync",
        action: result.action as MirrorCliActionName,
        peers: Array.isArray(payload.peers) ? payload.peers : undefined,
        updates:
          "canon" in payload || "graph" in payload || "node_id" in payload ? payload : undefined,
        pull_result:
          "pulled_files" in payload || "conflicts" in payload || "skipped_files" in payload
            ? payload
            : undefined,
        local: asRecord(payload.local),
        peer: asRecord(payload.peer),
      };
    case "find":
      return {
        ok: true,
        command: "find",
        results: Array.isArray(payload.candidates) ? payload.candidates : [],
        diagnostics: asRecord(payload.diagnostics),
      };
    case "fact":
      return {
        ok: true,
        command: "fact",
        canonical_fact: typeof payload.canonical_fact === "string" ? payload.canonical_fact : "",
        source: {
          scroll_id: typeof payload.source_scroll_id === "string" ? payload.source_scroll_id : "",
          title: typeof payload.title === "string" ? payload.title : "",
          path: typeof payload.path === "string" ? payload.path : "",
        },
        diagnostics: asRecord(payload.diagnostics),
        supersession_note:
          typeof payload.supersession_note === "string" ? payload.supersession_note : undefined,
        fact_update_reference:
          typeof payload.fact_update_reference === "string"
            ? payload.fact_update_reference
            : undefined,
      };
    case "interpret":
      return {
        ok: true,
        command: "interpret",
        interpretation: payload,
      };
    case "forge":
      return {
        ok: true,
        command: "forge",
        draft: payload,
      };
    case "commit":
      return {
        ok: true,
        command: "commit",
        commit_result: payload,
      };
    case "task":
      return {
        ok: true,
        command: "task",
        action: result.action as MirrorCliActionName,
        task: asRecord(payload.task),
        tasks: Array.isArray(payload.tasks) ? payload.tasks : undefined,
        deleted: typeof payload.deleted === "boolean" ? payload.deleted : undefined,
        task_id: typeof payload.task_id === "string" ? payload.task_id : undefined,
      };
    case "reminder":
      return {
        ok: true,
        command: "reminder",
        action: result.action as MirrorCliActionName,
        reminder: asRecord(payload.reminder),
        reminders: Array.isArray(payload.reminders) ? payload.reminders : undefined,
        deleted: typeof payload.deleted === "boolean" ? payload.deleted : undefined,
        reminder_id: typeof payload.reminder_id === "string" ? payload.reminder_id : undefined,
      };
    case "heartbeat":
      return {
        ok: true,
        command: "heartbeat",
        action: result.action as MirrorCliActionName,
        heartbeat: asRecord(payload.heartbeat),
        evaluation: asRecord(payload.evaluation),
        suggested_message:
          typeof payload.suggested_message === "string" ? payload.suggested_message : undefined,
        suggested_tone:
          typeof payload.suggested_tone === "string" ? payload.suggested_tone : undefined,
      };
    case "monk":
      return {
        ok: true,
        command: "monk",
        action: result.action as MirrorCliActionName,
        context: asRecord(payload.context),
        resume_context: asRecord(payload.resume_context),
        action_result: asRecord(payload.action ?? payload.action_result),
        actions: Array.isArray(payload.actions) ? payload.actions : undefined,
        note: asRecord(payload.note),
      };
    default:
      return {
        ok: false,
        command: result.command,
        error: `Unsupported Mirror CLI JSON output for command: ${result.command satisfies never}`,
      };
  }
}

export function formatMirrorCliJsonOutput(result: MirrorCliCommandResult): string {
  return `${JSON.stringify(toMirrorCliJsonOutput(result), null, 2)}\n`;
}

export function formatMirrorCliJsonError(
  command: MirrorCliCommandName | null,
  error: unknown,
  action?: MirrorCliActionName,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${JSON.stringify({ ok: false, command, action, error: message }, null, 2)}\n`;
}
