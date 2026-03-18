import type { MirrorPolicySurface } from "./policy_types.js";

const NETWORK_EXPOSED_SURFACES = new Set<MirrorPolicySurface>([
  "service",
  "console",
  "sync",
  "adapter",
]);

const MUTABLE_ACTION_NAMES = new Set([
  "sync.announce",
  "sync.pull",
  "mirror.commit-scroll",
  "mirror.task.create",
  "mirror.task.update",
  "mirror.task.complete",
  "mirror.task.delete",
  "mirror.reminder.create",
  "mirror.reminder.update",
  "mirror.reminder.delete",
  "mirror.reminder.enable",
  "mirror.reminder.disable",
  "mirror.heartbeat.update",
  "mirror.heartbeat.record-seen",
  "mirror.monk.followup-task",
  "mirror.monk.followup-reminder",
  "mirror.monk.note",
  "mirror.monk.record-action",
]);

export function isMirrorLocalOnlySurface(surface: MirrorPolicySurface | undefined): boolean {
  return surface === "cli";
}

export function isMirrorNetworkExposedSurface(surface: MirrorPolicySurface | undefined): boolean {
  return surface !== undefined && NETWORK_EXPOSED_SURFACES.has(surface);
}

export function isMirrorMutableActionName(actionName: string): boolean {
  return MUTABLE_ACTION_NAMES.has(actionName);
}
