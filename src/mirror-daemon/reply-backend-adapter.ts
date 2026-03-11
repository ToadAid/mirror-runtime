import type { FinalizedMsgContext } from "../auto-reply/templating.js";
import type { GetReplyOptions } from "../auto-reply/types.js";

export type MirrorDaemonReplyRequest = {
  sessionKey: string;
  agentId: string;
  accountId?: string;
  surface: string;
  text: string;
  rawText?: string;
  commandText?: string;
  chatType?: string;
  messageId?: string;
  replyTo?: {
    id?: string;
    body?: string;
    sender?: string;
    isQuote?: boolean;
  };
  attachments?: Array<{
    path?: string;
    url?: string;
    mediaType?: string;
    transcript?: string;
  }>;
  history?: Array<{
    sender: string;
    body: string;
    timestamp?: number;
  }>;
  route?: {
    originatingChannel?: string;
    originatingTo?: string;
    messageThreadId?: string | number;
  };
  sender?: {
    from?: string;
    to?: string;
    senderId?: string;
    senderName?: string;
    senderUsername?: string;
    senderE164?: string;
  };
  flags?: {
    wasMentioned?: boolean;
    commandAuthorized: boolean;
    isHeartbeat?: boolean;
  };
};

export type MirrorDaemonReplyRouteMeta = {
  agentId: string;
  accountId?: string;
  surface?: string;
};

function ensureRequiredString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`MirrorDaemon reply request requires ${label}`);
  }
  return trimmed;
}

function withDefinedProps<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function projectAttachments(ctx: FinalizedMsgContext): MirrorDaemonReplyRequest["attachments"] {
  const pathCount = Array.isArray(ctx.MediaPaths) ? ctx.MediaPaths.length : 0;
  const urlCount = Array.isArray(ctx.MediaUrls) ? ctx.MediaUrls.length : 0;
  const typeCount = Array.isArray(ctx.MediaTypes) ? ctx.MediaTypes.length : 0;
  const hasSingleMedia = Boolean(ctx.MediaPath || ctx.MediaUrl || ctx.MediaType);
  const attachmentCount = Math.max(pathCount, urlCount, typeCount, hasSingleMedia ? 1 : 0);

  if (attachmentCount === 0 && !ctx.Transcript) {
    return undefined;
  }

  const attachments = Array.from({ length: Math.max(attachmentCount, ctx.Transcript ? 1 : 0) })
    .map((_, index) =>
      withDefinedProps({
        path: Array.isArray(ctx.MediaPaths)
          ? ctx.MediaPaths[index]
          : index === 0
            ? ctx.MediaPath
            : undefined,
        url: Array.isArray(ctx.MediaUrls)
          ? ctx.MediaUrls[index]
          : index === 0
            ? ctx.MediaUrl
            : undefined,
        mediaType: Array.isArray(ctx.MediaTypes)
          ? ctx.MediaTypes[index]
          : index === 0
            ? ctx.MediaType
            : undefined,
        transcript: index === 0 ? ctx.Transcript : undefined,
      }),
    )
    .filter((attachment) => Object.keys(attachment).length > 0);

  return attachments.length > 0 ? attachments : undefined;
}

export function projectMirrorDaemonReplyRequest(
  ctx: FinalizedMsgContext,
  replyOptions: Pick<GetReplyOptions, "isHeartbeat"> | undefined,
  routeMeta: MirrorDaemonReplyRouteMeta,
): MirrorDaemonReplyRequest {
  const sessionKey = ensureRequiredString(ctx.SessionKey, "ctx.SessionKey");
  const agentId = ensureRequiredString(routeMeta.agentId, "routeMeta.agentId");
  const surface = ensureRequiredString(
    routeMeta.surface ?? ctx.Surface ?? ctx.Provider,
    "routeMeta.surface or ctx.Surface",
  );
  const messageId =
    ctx.MessageSidFull ?? ctx.MessageSid ?? ctx.MessageSidFirst ?? ctx.MessageSidLast;
  const attachments = projectAttachments(ctx);
  const replyTo = withDefinedProps({
    id: ctx.ReplyToIdFull ?? ctx.ReplyToId,
    body: ctx.ReplyToBody,
    sender: ctx.ReplyToSender,
    isQuote: ctx.ReplyToIsQuote,
  });
  const route = withDefinedProps({
    originatingChannel: ctx.OriginatingChannel ? String(ctx.OriginatingChannel) : undefined,
    originatingTo: ctx.OriginatingTo,
    messageThreadId: ctx.MessageThreadId,
  });
  const sender = withDefinedProps({
    from: ctx.From,
    to: ctx.To,
    senderId: ctx.SenderId,
    senderName: ctx.SenderName,
    senderUsername: ctx.SenderUsername,
    senderE164: ctx.SenderE164,
  });
  const flags = withDefinedProps({
    wasMentioned: ctx.WasMentioned,
    commandAuthorized: ctx.CommandAuthorized,
    isHeartbeat: replyOptions?.isHeartbeat,
  });

  return withDefinedProps({
    sessionKey,
    agentId,
    accountId: routeMeta.accountId ?? ctx.AccountId,
    surface,
    text: ctx.BodyForAgent ?? ctx.Body,
    rawText: ctx.RawBody,
    commandText: ctx.BodyForCommands,
    chatType: ctx.ChatType,
    messageId,
    replyTo: Object.keys(replyTo).length > 0 ? replyTo : undefined,
    attachments,
    history: ctx.InboundHistory,
    route: Object.keys(route).length > 0 ? route : undefined,
    sender: Object.keys(sender).length > 0 ? sender : undefined,
    flags,
  });
}
