import type { ReplyPayload } from "../auto-reply/types.js";
import type { MirrorDaemonReplyRequest } from "./reply-backend-adapter.js";

export const MIRROR_EXECUTE_ENDPOINT = "/mirror/execute";

export type MirrorExecuteResponse = ReplyPayload | ReplyPayload[];

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isOptionalNumberOrString(value: unknown): value is number | string | undefined {
  return value === undefined || typeof value === "number" || typeof value === "string";
}

function isReplyPayload(value: unknown): value is ReplyPayload {
  if (!isRecord(value)) {
    return false;
  }
  const hasKnownReplyField =
    "text" in value ||
    "mediaUrl" in value ||
    "mediaUrls" in value ||
    "replyToId" in value ||
    "replyToTag" in value ||
    "replyToCurrent" in value ||
    "audioAsVoice" in value ||
    "isError" in value ||
    "isReasoning" in value ||
    "channelData" in value;
  return (
    hasKnownReplyField &&
    isOptionalString(value.text) &&
    isOptionalString(value.mediaUrl) &&
    (value.mediaUrls === undefined ||
      (Array.isArray(value.mediaUrls) &&
        value.mediaUrls.every((entry) => typeof entry === "string"))) &&
    isOptionalString(value.replyToId) &&
    isOptionalBoolean(value.replyToTag) &&
    isOptionalBoolean(value.replyToCurrent) &&
    isOptionalBoolean(value.audioAsVoice) &&
    isOptionalBoolean(value.isError) &&
    isOptionalBoolean(value.isReasoning) &&
    (value.channelData === undefined || isRecord(value.channelData))
  );
}

export function validateMirrorDaemonReplyRequest(
  value: unknown,
): ValidationResult<MirrorDaemonReplyRequest> {
  if (!isRecord(value)) {
    return { ok: false, error: "request body must be an object" };
  }
  if (typeof value.sessionKey !== "string" || value.sessionKey.trim().length === 0) {
    return { ok: false, error: "sessionKey is required" };
  }
  if (typeof value.agentId !== "string" || value.agentId.trim().length === 0) {
    return { ok: false, error: "agentId is required" };
  }
  if (typeof value.surface !== "string" || value.surface.trim().length === 0) {
    return { ok: false, error: "surface is required" };
  }
  if (typeof value.text !== "string") {
    return { ok: false, error: "text is required" };
  }

  if (
    !isOptionalString(value.accountId) ||
    !isOptionalString(value.rawText) ||
    !isOptionalString(value.commandText) ||
    !isOptionalString(value.chatType) ||
    !isOptionalString(value.messageId)
  ) {
    return { ok: false, error: "top-level string fields are invalid" };
  }

  if (value.replyTo !== undefined) {
    if (!isRecord(value.replyTo)) {
      return { ok: false, error: "replyTo must be an object" };
    }
    if (
      !isOptionalString(value.replyTo.id) ||
      !isOptionalString(value.replyTo.body) ||
      !isOptionalString(value.replyTo.sender) ||
      !isOptionalBoolean(value.replyTo.isQuote)
    ) {
      return { ok: false, error: "replyTo fields are invalid" };
    }
  }

  if (value.attachments !== undefined) {
    if (!Array.isArray(value.attachments)) {
      return { ok: false, error: "attachments must be an array" };
    }
    for (const attachment of value.attachments) {
      if (!isRecord(attachment)) {
        return { ok: false, error: "attachments entries must be objects" };
      }
      if (
        !isOptionalString(attachment.path) ||
        !isOptionalString(attachment.url) ||
        !isOptionalString(attachment.mediaType) ||
        !isOptionalString(attachment.transcript)
      ) {
        return { ok: false, error: "attachment fields are invalid" };
      }
    }
  }

  if (value.history !== undefined) {
    if (!Array.isArray(value.history)) {
      return { ok: false, error: "history must be an array" };
    }
    for (const entry of value.history) {
      if (
        !isRecord(entry) ||
        typeof entry.sender !== "string" ||
        typeof entry.body !== "string" ||
        (entry.timestamp !== undefined && typeof entry.timestamp !== "number")
      ) {
        return { ok: false, error: "history entries are invalid" };
      }
    }
  }

  if (value.route !== undefined) {
    if (!isRecord(value.route)) {
      return { ok: false, error: "route must be an object" };
    }
    if (
      !isOptionalString(value.route.originatingChannel) ||
      !isOptionalString(value.route.originatingTo) ||
      !isOptionalNumberOrString(value.route.messageThreadId)
    ) {
      return { ok: false, error: "route fields are invalid" };
    }
  }

  if (value.sender !== undefined) {
    if (!isRecord(value.sender)) {
      return { ok: false, error: "sender must be an object" };
    }
    if (
      !isOptionalString(value.sender.from) ||
      !isOptionalString(value.sender.to) ||
      !isOptionalString(value.sender.senderId) ||
      !isOptionalString(value.sender.senderName) ||
      !isOptionalString(value.sender.senderUsername) ||
      !isOptionalString(value.sender.senderE164)
    ) {
      return { ok: false, error: "sender fields are invalid" };
    }
  }

  if (value.flags !== undefined) {
    if (!isRecord(value.flags)) {
      return { ok: false, error: "flags must be an object" };
    }
    if (
      typeof value.flags.commandAuthorized !== "boolean" ||
      !isOptionalBoolean(value.flags.wasMentioned) ||
      !isOptionalBoolean(value.flags.isHeartbeat)
    ) {
      return { ok: false, error: "flags fields are invalid" };
    }
  }

  return { ok: true, value: value as MirrorDaemonReplyRequest };
}

export function validateMirrorExecuteResponse(
  value: unknown,
): ValidationResult<MirrorExecuteResponse> {
  if (Array.isArray(value)) {
    if (!value.every((entry) => isReplyPayload(entry))) {
      return { ok: false, error: "response payload array is invalid" };
    }
    return { ok: true, value };
  }
  if (!isReplyPayload(value)) {
    return { ok: false, error: "response payload is invalid" };
  }
  return { ok: true, value };
}
