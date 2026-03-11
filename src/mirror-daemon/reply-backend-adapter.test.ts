import { describe, expect, it } from "vitest";
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.js";
import { projectMirrorDaemonReplyRequest } from "./reply-backend-adapter.js";

describe("projectMirrorDaemonReplyRequest", () => {
  it("projects a finalized Telegram context into a daemon-safe request", () => {
    const ctx = finalizeInboundContext({
      Body: "ignored body",
      BodyForAgent: "telegram normalized text",
      BodyForCommands: "/sum 1 2",
      RawBody: "/sum 1 2",
      SessionKey: "agent:main:telegram:direct:123",
      AccountId: "telegram-main",
      MessageSid: "short-msg-id",
      MessageSidFull: "telegram-full-msg-id",
      ReplyToId: "reply-short-id",
      ReplyToIdFull: "reply-full-id",
      ReplyToBody: "quoted text",
      ReplyToSender: "alice",
      ReplyToIsQuote: true,
      InboundHistory: [{ sender: "alice", body: "hi", timestamp: 1700000000 }],
      From: "123",
      To: "456",
      SenderId: "42",
      SenderName: "Alice",
      SenderUsername: "alice_user",
      SenderE164: "+15550001111",
      ChatType: "direct",
      Surface: "telegram",
      Provider: "telegram",
      OriginatingChannel: "telegram",
      OriginatingTo: "123",
      MessageThreadId: 99,
      WasMentioned: true,
      CommandAuthorized: true,
      Sticker: {
        fileId: "sticker-file-id",
        fileUniqueId: "sticker-unique-id",
      },
      GroupMembers: "should stay out",
    });

    expect(
      projectMirrorDaemonReplyRequest(ctx, { isHeartbeat: false }, { agentId: "main" }),
    ).toEqual({
      sessionKey: "agent:main:telegram:direct:123",
      agentId: "main",
      accountId: "telegram-main",
      surface: "telegram",
      text: "telegram normalized text",
      rawText: "/sum 1 2",
      commandText: "/sum 1 2",
      chatType: "direct",
      messageId: "telegram-full-msg-id",
      replyTo: {
        id: "reply-full-id",
        body: "quoted text",
        sender: "alice",
        isQuote: true,
      },
      history: [{ sender: "alice", body: "hi", timestamp: 1700000000 }],
      route: {
        originatingChannel: "telegram",
        originatingTo: "123",
        messageThreadId: 99,
      },
      sender: {
        from: "123",
        to: "456",
        senderId: "42",
        senderName: "Alice",
        senderUsername: "alice_user",
        senderE164: "+15550001111",
      },
      flags: {
        wasMentioned: true,
        commandAuthorized: true,
        isHeartbeat: false,
      },
    });
  });

  it("projects a finalized WhatsApp/web context with attachments and transcript", () => {
    const ctx = finalizeInboundContext({
      Body: "history-shaped body",
      BodyForAgent: "voice note summary",
      BodyForCommands: "voice note summary",
      RawBody: "raw inbound text",
      SessionKey: "agent:main:whatsapp:direct:+15550001111",
      AccountId: "wa-account",
      MessageSid: "wa-msg-1",
      From: "+15550001111",
      To: "+15550002222",
      SenderE164: "+15550001111",
      ChatType: "direct",
      Surface: "whatsapp",
      Provider: "whatsapp",
      MediaPaths: ["/tmp/audio.ogg", "/tmp/image.jpg"],
      MediaUrls: ["https://example.com/audio.ogg", "https://example.com/image.jpg"],
      MediaTypes: ["audio/ogg", "image/jpeg"],
      Transcript: "hello from voice note",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "+15550001111",
      CommandAuthorized: false,
      HookMessages: ["should stay out"],
      GatewayClientScopes: ["internal"],
    });

    expect(
      projectMirrorDaemonReplyRequest(
        ctx,
        { isHeartbeat: true },
        {
          agentId: "main",
          surface: "whatsapp",
        },
      ),
    ).toEqual({
      sessionKey: "agent:main:whatsapp:direct:+15550001111",
      agentId: "main",
      accountId: "wa-account",
      surface: "whatsapp",
      text: "voice note summary",
      rawText: "raw inbound text",
      commandText: "voice note summary",
      chatType: "direct",
      messageId: "wa-msg-1",
      attachments: [
        {
          path: "/tmp/audio.ogg",
          url: "https://example.com/audio.ogg",
          mediaType: "audio/ogg",
          transcript: "hello from voice note",
        },
        {
          path: "/tmp/image.jpg",
          url: "https://example.com/image.jpg",
          mediaType: "image/jpeg",
        },
      ],
      route: {
        originatingChannel: "whatsapp",
        originatingTo: "+15550001111",
      },
      sender: {
        from: "+15550001111",
        to: "+15550002222",
        senderE164: "+15550001111",
      },
      flags: {
        commandAuthorized: false,
        isHeartbeat: true,
      },
    });
  });
});
