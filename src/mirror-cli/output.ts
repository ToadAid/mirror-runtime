import { formatVerifyLoreHuman } from "../mirror/lore_manifest/index.js";
import { formatMirrorStatusHuman } from "../mirror/status/format.js";
import type { MirrorCliCommandResult } from "./commands.js";
import { formatMirrorCliJsonOutput } from "./json_output.js";

export function formatMirrorCliResult(result: MirrorCliCommandResult, json = false): string {
  if (json) {
    return formatMirrorCliJsonOutput(result);
  }

  if (result.kind === "chat") {
    const answer = result.response.choices[0]?.message.content ?? "";
    return `Mirror Chat\nmodel: ${result.response.model}\nanswer: ${answer}\n`;
  }

  if (result.kind === "serve") {
    return `Mirror Service\nport: ${result.service.port}\n`;
  }

  if (result.kind === "status") {
    return formatMirrorStatusHuman(result.status);
  }

  if (result.kind === "verify-lore") {
    return formatVerifyLoreHuman(
      result.verification.manifest_path,
      result.verification.directory,
      result.verification,
    );
  }

  if (result.command === "sync") {
    return `Mirror Sync ${result.action}\n${JSON.stringify(result.result, null, 2)}\n`;
  }

  if (result.command === "task") {
    if (result.action === "list") {
      return `Mirror Task List\n${JSON.stringify(result.result.tasks ?? [], null, 2)}\n`;
    }
    return `Mirror Task ${result.action}\n${JSON.stringify(result.result, null, 2)}\n`;
  }

  if (result.command === "reminder") {
    if (result.action === "list" || result.action === "due") {
      return `Mirror Reminder ${result.action}\n${JSON.stringify(result.result.reminders ?? [], null, 2)}\n`;
    }
    return `Mirror Reminder ${result.action}\n${JSON.stringify(result.result, null, 2)}\n`;
  }

  if (result.command === "heartbeat") {
    return `Mirror Heartbeat ${result.action}\n${JSON.stringify(result.result, null, 2)}\n`;
  }

  if (result.command === "monk") {
    return `Mirror Monk ${result.action}\n${JSON.stringify(result.result, null, 2)}\n`;
  }

  return `Mirror ${result.command}\ntool: ${result.tool}\n${JSON.stringify(result.result, null, 2)}\n`;
}
