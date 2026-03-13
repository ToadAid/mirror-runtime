import { createMirrorHeartbeatManager } from "../../../mirror-heartbeat/index.js";
import { createMirrorMonkActions } from "../../../mirror-monk-actions/index.js";
import { createMirrorMonkWorkspaceBridge } from "../../../mirror-monk/index.js";
import { createMirrorReminderManager } from "../../../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../../../mirror-task/index.js";
import { canonFact } from "../canon_fact/index.js";
import { commitScroll } from "../commit_scroll/index.js";
import { findScroll } from "../find_scroll/index.js";
import { forgeScroll } from "../forge_scroll/index.js";
import { interpretTweet } from "../interpret_tweet/index.js";
import type { MirrorSkill } from "../types.js";

export type MirrorSkillRegistry = {
  registerSkill: (skill: MirrorSkill) => void;
  getSkill: (name: string) => MirrorSkill | undefined;
  listSkills: () => MirrorSkill[];
};

export type MirrorToolInputSchema = {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "integer" | "array" | "object" | "boolean";
      description?: string;
      enum?: string[];
    }
  >;
  required?: string[];
};

export type MirrorSkillTool = {
  metadata: {
    name: string;
    description: string;
    version: string;
    access: "open" | "operator";
  };
  inputSchema: MirrorToolInputSchema;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type MirrorToolRegistry = {
  registerTool: (tool: MirrorSkillTool) => void;
  getTool: (name: string) => MirrorSkillTool | undefined;
  listTools: () => MirrorSkillTool[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export function createMirrorSkillRegistry(): MirrorSkillRegistry {
  const skills = new Map<string, MirrorSkill>();

  return {
    registerSkill(skill: MirrorSkill): void {
      const name = skill.meta.name;
      if (skills.has(name)) {
        throw new Error(`Mirror skill already registered: ${name}`);
      }
      skills.set(name, skill);
    },

    getSkill(name: string): MirrorSkill | undefined {
      return skills.get(name);
    },

    listSkills(): MirrorSkill[] {
      return [...skills.values()];
    },
  };
}

export function getMirrorNativeSkillTools(): MirrorSkillTool[] {
  const taskManager = createMirrorTaskManager();
  const reminderManager = createMirrorReminderManager();
  const heartbeatManager = createMirrorHeartbeatManager();
  const monkBridge = createMirrorMonkWorkspaceBridge();
  const monkActions = createMirrorMonkActions();

  return [
    {
      metadata: {
        name: "mirror.find-scroll",
        description: "Find canon-first Tobyworld scroll candidates for a query",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "User query to search canonical lore" },
          user_id: { type: "string", description: "Optional user identifier" },
          limit: { type: "integer", description: "Optional candidate limit" },
        },
        required: ["query"],
      },
      async execute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return findScroll({
          query: String(input.query ?? ""),
          user_id: typeof input.user_id === "string" ? input.user_id : undefined,
          limit: typeof input.limit === "number" ? input.limit : undefined,
        }) as Promise<Record<string, unknown>>;
      },
    },
    {
      metadata: {
        name: "mirror.canon-fact",
        description: "Resolve a canon-first factual statement for a query",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "User query to resolve canon fact" },
          user_id: { type: "string", description: "Optional user identifier" },
        },
        required: ["query"],
      },
      async execute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return canonFact({
          query: String(input.query ?? ""),
          user_id: typeof input.user_id === "string" ? input.user_id : undefined,
        }) as Promise<Record<string, unknown>>;
      },
    },
    {
      metadata: {
        name: "mirror.forge-scroll",
        description: "Generate a schema-conformant Tobyworld scroll draft",
        version: "1.0.0",
        access: "operator",
      },
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Draft scroll title" },
          category: { type: "string", enum: ["L", "QA", "C"], description: "Scroll family" },
          narrative: { type: "string", description: "Draft narrative text" },
          symbols: { type: "array", description: "Optional symbols to seed the draft" },
          anchors: { type: "object", description: "Optional prev/next anchor references" },
        },
        required: ["title", "category", "narrative"],
      },
      async execute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return forgeScroll({
          title: String(input.title ?? ""),
          category: String(input.category ?? "") as "L" | "QA" | "C",
          narrative: String(input.narrative ?? ""),
          symbols: Array.isArray(input.symbols)
            ? input.symbols.filter((value): value is string => typeof value === "string")
            : undefined,
          anchors:
            input.anchors && typeof input.anchors === "object"
              ? {
                  prev:
                    typeof (input.anchors as { prev?: unknown }).prev === "string"
                      ? (input.anchors as { prev?: string }).prev
                      : undefined,
                  next:
                    typeof (input.anchors as { next?: unknown }).next === "string"
                      ? (input.anchors as { next?: string }).next
                      : undefined,
                }
              : undefined,
        }) as Promise<Record<string, unknown>>;
      },
    },
    {
      metadata: {
        name: "mirror.commit-scroll",
        description: "Validate and commit a new canonical Tobyworld scroll",
        version: "1.0.0",
        access: "operator",
      },
      inputSchema: {
        type: "object",
        properties: {
          draft_scroll_content: { type: "string", description: "Full draft markdown scroll" },
          preferred_filename: { type: "string", description: "Optional filename hint" },
          family_override: {
            type: "string",
            enum: ["L", "QA", "C"],
            description: "Optional family override",
          },
          dry_run: { type: "boolean", description: "Optional preview-only flag" },
          force: {
            type: "boolean",
            description: "Optional operator override for review conflicts",
          },
        },
        required: ["draft_scroll_content"],
      },
      async execute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return commitScroll({
          draft_scroll_content: String(input.draft_scroll_content ?? ""),
          preferred_filename:
            typeof input.preferred_filename === "string" ? input.preferred_filename : undefined,
          family_override:
            typeof input.family_override === "string"
              ? (input.family_override as "L" | "QA" | "C")
              : undefined,
          dry_run: typeof input.dry_run === "boolean" ? input.dry_run : undefined,
          force: typeof input.force === "boolean" ? input.force : undefined,
        }) as Promise<Record<string, unknown>>;
      },
    },
    {
      metadata: {
        name: "mirror.task.create",
        description: "Create a user-scoped personal task in the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Optional task description" },
          due_at: { type: "string", description: "Optional due timestamp" },
          tags: { type: "array", description: "Optional task tags" },
          related_draft_id: { type: "string", description: "Optional related draft id" },
        },
        required: ["user_id", "title"],
      },
      async execute(input) {
        const task = await taskManager.createTask(String(input.user_id ?? ""), {
          title: String(input.title ?? ""),
          description: typeof input.description === "string" ? input.description : undefined,
          due_at: typeof input.due_at === "string" ? input.due_at : undefined,
          tags: Array.isArray(input.tags)
            ? input.tags.filter((value): value is string => typeof value === "string")
            : undefined,
          related_draft_id:
            typeof input.related_draft_id === "string" ? input.related_draft_id : undefined,
        });
        return { task };
      },
    },
    {
      metadata: {
        name: "mirror.task.list",
        description: "List personal tasks from the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const tasks = await taskManager.listTasks(String(input.user_id ?? ""));
        return { tasks };
      },
    },
    {
      metadata: {
        name: "mirror.task.update",
        description: "Update a personal task in the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          task_id: { type: "string", description: "Task identifier" },
          title: { type: "string", description: "Optional task title" },
          description: { type: "string", description: "Optional task description" },
          status: {
            type: "string",
            enum: ["active", "paused", "done"],
            description: "Optional task status",
          },
          due_at: { type: "string", description: "Optional due timestamp" },
          tags: { type: "array", description: "Optional task tags" },
          related_draft_id: { type: "string", description: "Optional related draft id" },
        },
        required: ["user_id", "task_id"],
      },
      async execute(input) {
        const task = await taskManager.updateTask(
          String(input.user_id ?? ""),
          String(input.task_id ?? ""),
          {
            title: typeof input.title === "string" ? input.title : undefined,
            description: typeof input.description === "string" ? input.description : undefined,
            status:
              typeof input.status === "string"
                ? (input.status as "active" | "paused" | "done")
                : undefined,
            due_at: typeof input.due_at === "string" ? input.due_at : undefined,
            tags: Array.isArray(input.tags)
              ? input.tags.filter((value): value is string => typeof value === "string")
              : undefined,
            related_draft_id:
              typeof input.related_draft_id === "string" ? input.related_draft_id : undefined,
          },
        );
        return { task };
      },
    },
    {
      metadata: {
        name: "mirror.task.complete",
        description: "Mark a personal task complete",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          task_id: { type: "string", description: "Task identifier" },
        },
        required: ["user_id", "task_id"],
      },
      async execute(input) {
        const task = await taskManager.completeTask(
          String(input.user_id ?? ""),
          String(input.task_id ?? ""),
        );
        return { task };
      },
    },
    {
      metadata: {
        name: "mirror.task.delete",
        description: "Delete a personal task from the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          task_id: { type: "string", description: "Task identifier" },
        },
        required: ["user_id", "task_id"],
      },
      async execute(input) {
        const deleted = await taskManager.deleteTask(
          String(input.user_id ?? ""),
          String(input.task_id ?? ""),
        );
        return { deleted, task_id: String(input.task_id ?? "") };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.create",
        description: "Create a user-scoped reminder in the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          title: { type: "string", description: "Reminder title" },
          message: { type: "string", description: "Optional reminder message" },
          remind_at: { type: "string", description: "Reminder timestamp" },
          recurrence: {
            type: "string",
            enum: ["none", "daily", "weekly"],
            description: "Optional recurrence",
          },
          related_task_id: { type: "string", description: "Optional related task id" },
          tags: { type: "array", description: "Optional reminder tags" },
        },
        required: ["user_id", "title"],
      },
      async execute(input) {
        const reminder = await reminderManager.createReminder(String(input.user_id ?? ""), {
          title: String(input.title ?? ""),
          message: typeof input.message === "string" ? input.message : undefined,
          remind_at: typeof input.remind_at === "string" ? input.remind_at : undefined,
          recurrence:
            typeof input.recurrence === "string"
              ? (input.recurrence as "none" | "daily" | "weekly")
              : undefined,
          related_task_id:
            typeof input.related_task_id === "string" ? input.related_task_id : undefined,
          tags: Array.isArray(input.tags)
            ? input.tags.filter((value): value is string => typeof value === "string")
            : undefined,
        });
        return { reminder };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.list",
        description: "List user-scoped reminders from the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const reminders = await reminderManager.listReminders(String(input.user_id ?? ""));
        return { reminders };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.update",
        description: "Update a user-scoped reminder in the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          reminder_id: { type: "string", description: "Reminder identifier" },
          title: { type: "string", description: "Optional reminder title" },
          message: { type: "string", description: "Optional reminder message" },
          status: {
            type: "string",
            enum: ["active", "paused", "delivered", "dismissed"],
            description: "Optional reminder status",
          },
          remind_at: { type: "string", description: "Optional reminder timestamp" },
          recurrence: {
            type: "string",
            enum: ["none", "daily", "weekly"],
            description: "Optional recurrence",
          },
          related_task_id: { type: "string", description: "Optional related task id" },
          tags: { type: "array", description: "Optional reminder tags" },
        },
        required: ["user_id", "reminder_id"],
      },
      async execute(input) {
        const reminder = await reminderManager.updateReminder(
          String(input.user_id ?? ""),
          String(input.reminder_id ?? ""),
          {
            title: typeof input.title === "string" ? input.title : undefined,
            message: typeof input.message === "string" ? input.message : undefined,
            status:
              typeof input.status === "string"
                ? (input.status as "active" | "paused" | "delivered" | "dismissed")
                : undefined,
            remind_at: typeof input.remind_at === "string" ? input.remind_at : undefined,
            recurrence:
              typeof input.recurrence === "string"
                ? (input.recurrence as "none" | "daily" | "weekly")
                : undefined,
            related_task_id:
              typeof input.related_task_id === "string" ? input.related_task_id : undefined,
            tags: Array.isArray(input.tags)
              ? input.tags.filter((value): value is string => typeof value === "string")
              : undefined,
          },
        );
        return { reminder };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.delete",
        description: "Delete a user-scoped reminder from the Mirror workspace",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          reminder_id: { type: "string", description: "Reminder identifier" },
        },
        required: ["user_id", "reminder_id"],
      },
      async execute(input) {
        const deleted = await reminderManager.deleteReminder(
          String(input.user_id ?? ""),
          String(input.reminder_id ?? ""),
        );
        return { deleted, reminder_id: String(input.reminder_id ?? "") };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.enable",
        description: "Enable a user-scoped reminder",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          reminder_id: { type: "string", description: "Reminder identifier" },
        },
        required: ["user_id", "reminder_id"],
      },
      async execute(input) {
        const reminder = await reminderManager.enableReminder(
          String(input.user_id ?? ""),
          String(input.reminder_id ?? ""),
        );
        return { reminder };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.disable",
        description: "Pause a user-scoped reminder",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          reminder_id: { type: "string", description: "Reminder identifier" },
        },
        required: ["user_id", "reminder_id"],
      },
      async execute(input) {
        const reminder = await reminderManager.disableReminder(
          String(input.user_id ?? ""),
          String(input.reminder_id ?? ""),
        );
        return { reminder };
      },
    },
    {
      metadata: {
        name: "mirror.reminder.due",
        description: "List due reminders for a user at the current time",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          now: { type: "string", description: "Optional override timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const dueReminders = await reminderManager.getDueReminders(
          String(input.user_id ?? ""),
          typeof input.now === "string" ? new Date(input.now) : new Date(),
        );
        return { reminders: dueReminders };
      },
    },
    {
      metadata: {
        name: "mirror.heartbeat.get",
        description: "Get heartbeat preferences and state for a user",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const heartbeat = await heartbeatManager.getHeartbeatState(String(input.user_id ?? ""));
        return { heartbeat };
      },
    },
    {
      metadata: {
        name: "mirror.heartbeat.update",
        description: "Update opt-in heartbeat preferences for a user",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          enabled: { type: "boolean", description: "Optional opt-in state" },
          check_in_after_inactivity_days: {
            type: "integer",
            description: "Optional inactivity threshold in days",
          },
          quiet_mode: { type: "boolean", description: "Optional quiet mode flag" },
          preferred_tone: {
            type: "string",
            enum: ["gentle", "calm", "steady"],
            description: "Optional heartbeat tone",
          },
          opt_in_source: { type: "string", description: "Optional opt-in source metadata" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const heartbeat = await heartbeatManager.updateHeartbeatPreferences(
          String(input.user_id ?? ""),
          {
            enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
            check_in_after_inactivity_days:
              typeof input.check_in_after_inactivity_days === "number"
                ? input.check_in_after_inactivity_days
                : undefined,
            quiet_mode: typeof input.quiet_mode === "boolean" ? input.quiet_mode : undefined,
            preferred_tone:
              typeof input.preferred_tone === "string"
                ? (input.preferred_tone as "gentle" | "calm" | "steady")
                : undefined,
            opt_in_source:
              typeof input.opt_in_source === "string" ? input.opt_in_source : undefined,
          },
        );
        return { heartbeat };
      },
    },
    {
      metadata: {
        name: "mirror.heartbeat.record-seen",
        description: "Record recent local activity for a user heartbeat state",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          seen_at: { type: "string", description: "Optional override timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const heartbeat = await heartbeatManager.recordUserSeen(
          String(input.user_id ?? ""),
          typeof input.seen_at === "string" ? input.seen_at : undefined,
        );
        return { heartbeat };
      },
    },
    {
      metadata: {
        name: "mirror.heartbeat.evaluate",
        description: "Evaluate whether a heartbeat check-in would be due",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          now: { type: "string", description: "Optional evaluation timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const userId = String(input.user_id ?? "");
        const now = typeof input.now === "string" ? new Date(input.now) : new Date();
        const evaluation = await heartbeatManager.getHeartbeatEvaluation(userId, now);
        const suggested = await heartbeatManager.getSuggestedHeartbeatMessage(userId, now);
        return {
          evaluation,
          suggested_message: suggested.message,
          suggested_tone: suggested.tone,
        };
      },
    },
    {
      metadata: {
        name: "mirror.monk.context",
        description: "Read the assembled Monk workspace context for a user",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          now: { type: "string", description: "Optional context timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const context = await monkBridge.getMonkWorkspaceContext(
          String(input.user_id ?? ""),
          typeof input.now === "string" ? new Date(input.now) : new Date(),
        );
        return { context };
      },
    },
    {
      metadata: {
        name: "mirror.monk.next-task",
        description: "Suggest the next active task Monk should help with",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const action = await monkActions.getNextMonkTask(String(input.user_id ?? ""));
        return { action };
      },
    },
    {
      metadata: {
        name: "mirror.monk.open-work",
        description: "Summarize unfinished user work for Monk follow-up",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          now: { type: "string", description: "Optional evaluation timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const action = await monkActions.summarizeMonkOpenWork(
          String(input.user_id ?? ""),
          typeof input.now === "string" ? new Date(input.now) : new Date(),
        );
        return { action };
      },
    },
    {
      metadata: {
        name: "mirror.monk.due-reminders",
        description: "List Monk follow-up actions for due reminders",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          now: { type: "string", description: "Optional evaluation timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const actions = await monkActions.getMonkDueReminderActions(
          String(input.user_id ?? ""),
          typeof input.now === "string" ? new Date(input.now) : new Date(),
        );
        return { actions };
      },
    },
    {
      metadata: {
        name: "mirror.monk.resume",
        description: "Assemble Monk resume context and suggest the next resume action",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          now: { type: "string", description: "Optional evaluation timestamp" },
        },
        required: ["user_id"],
      },
      async execute(input) {
        const userId = String(input.user_id ?? "");
        const now = typeof input.now === "string" ? new Date(input.now) : new Date();
        const [resume_context, action] = await Promise.all([
          monkActions.getMonkResumeContext(userId, now),
          monkActions.suggestMonkResumeAction(userId, now),
        ]);
        return { resume_context, action };
      },
    },
    {
      metadata: {
        name: "mirror.monk.followup-task",
        description: "Suggest a Monk follow-up action for a selected task",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          task_id: { type: "string", description: "Task identifier" },
        },
        required: ["user_id", "task_id"],
      },
      async execute(input) {
        const action = await monkActions.getMonkTaskFollowup(
          String(input.user_id ?? ""),
          String(input.task_id ?? ""),
        );
        return { action };
      },
    },
    {
      metadata: {
        name: "mirror.monk.followup-reminder",
        description: "Suggest a Monk follow-up action for a due reminder",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          reminder_id: { type: "string", description: "Reminder identifier" },
          now: { type: "string", description: "Optional evaluation timestamp" },
        },
        required: ["user_id", "reminder_id"],
      },
      async execute(input) {
        const action = await monkActions.getReminderLinkedTaskFollowup(
          String(input.user_id ?? ""),
          String(input.reminder_id ?? ""),
          typeof input.now === "string" ? new Date(input.now) : new Date(),
        );
        return { action };
      },
    },
    {
      metadata: {
        name: "mirror.monk.note",
        description: "Append a Monk-owned follow-up note inside workspace context",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          note: { type: "string", description: "Monk follow-up note content" },
        },
        required: ["user_id", "note"],
      },
      async execute(input) {
        const note = await monkActions.appendMonkFollowupNote(
          String(input.user_id ?? ""),
          String(input.note ?? ""),
        );
        return { note };
      },
    },
    {
      metadata: {
        name: "mirror.monk.record-action",
        description: "Record a Monk suggested action inside Monk-owned workspace notes",
        version: "1.0.0",
        access: "open",
      },
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Workspace user identifier" },
          kind: {
            type: "string",
            enum: [
              "next_task",
              "task_followup",
              "open_work_summary",
              "due_reminder",
              "reminder_followup",
              "resume",
            ],
            description: "Monk action kind",
          },
          source: {
            type: "string",
            enum: ["task", "reminder", "session", "resume", "heartbeat", "workspace"],
            description: "Action source",
          },
          summary: { type: "string", description: "Action summary" },
          suggested_action: { type: "string", description: "Suggested next step" },
          related_task_id: { type: "string", description: "Optional related task id" },
          related_reminder_id: { type: "string", description: "Optional related reminder id" },
          related_draft_id: { type: "string", description: "Optional related draft id" },
          context_notes: { type: "array", description: "Optional context note strings" },
        },
        required: ["user_id", "kind", "source", "summary", "suggested_action"],
      },
      async execute(input) {
        const record = await monkActions.recordMonkSuggestedAction(String(input.user_id ?? ""), {
          kind: String(input.kind ?? "") as
            | "next_task"
            | "task_followup"
            | "open_work_summary"
            | "due_reminder"
            | "reminder_followup"
            | "resume",
          user_id: String(input.user_id ?? ""),
          source: String(input.source ?? "") as
            | "task"
            | "reminder"
            | "session"
            | "resume"
            | "heartbeat"
            | "workspace",
          summary: String(input.summary ?? ""),
          suggested_action: String(input.suggested_action ?? ""),
          related_task_id:
            typeof input.related_task_id === "string" ? input.related_task_id : undefined,
          related_reminder_id:
            typeof input.related_reminder_id === "string" ? input.related_reminder_id : undefined,
          related_draft_id:
            typeof input.related_draft_id === "string" ? input.related_draft_id : undefined,
          context_notes: Array.isArray(input.context_notes)
            ? input.context_notes.filter((value): value is string => typeof value === "string")
            : [],
        });
        return { note: record };
      },
    },
    {
      metadata: {
        name: "mirror.interpret-tweet",
        description: "Interpret a raw Toadgod tweet into a forge-scroll-ready draft plan",
        version: "1.0.0",
        access: "operator",
      },
      inputSchema: {
        type: "object",
        properties: {
          tweet_text: { type: "string", description: "Raw tweet text" },
          date: { type: "string", description: "Optional observed date" },
          source_ref: { type: "string", description: "Optional source reference" },
          preferred_family: {
            type: "string",
            enum: ["L", "QA", "C"],
            description: "Optional preferred scroll family",
          },
        },
        required: ["tweet_text"],
      },
      async execute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return interpretTweet({
          tweet_text: String(input.tweet_text ?? ""),
          date: typeof input.date === "string" ? input.date : undefined,
          source_ref: typeof input.source_ref === "string" ? input.source_ref : undefined,
          preferred_family:
            typeof input.preferred_family === "string"
              ? (input.preferred_family as "L" | "QA" | "C")
              : undefined,
        }) as Promise<Record<string, unknown>>;
      },
    },
  ];
}

export function createMirrorToolRegistry(
  tools: MirrorSkillTool[] = getMirrorNativeSkillTools(),
): MirrorToolRegistry {
  const toolMap = new Map<string, MirrorSkillTool>();

  for (const tool of tools) {
    if (toolMap.has(tool.metadata.name)) {
      throw new Error(`Mirror tool already registered: ${tool.metadata.name}`);
    }
    toolMap.set(tool.metadata.name, tool);
  }

  return {
    registerTool(tool: MirrorSkillTool): void {
      if (toolMap.has(tool.metadata.name)) {
        throw new Error(`Mirror tool already registered: ${tool.metadata.name}`);
      }
      toolMap.set(tool.metadata.name, tool);
    },
    getTool(name: string): MirrorSkillTool | undefined {
      return toolMap.get(name);
    },
    listTools(): MirrorSkillTool[] {
      return [...toolMap.values()];
    },
    async executeTool(
      name: string,
      input: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const tool = toolMap.get(name);
      if (!tool) {
        throw new Error(`Unknown Mirror tool: ${name}`);
      }
      return tool.execute(input);
    },
  };
}
