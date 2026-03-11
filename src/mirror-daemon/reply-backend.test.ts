import { afterEach, describe, expect, it, vi } from "vitest";
import { MirrorDaemonReplyBackend } from "./reply-backend.js";
import { StubMirrorRuntimeClient } from "./runtime-client.js";

describe("MirrorDaemonReplyBackend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("projects a Telegram-style request and returns a valid reply payload stub", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const backend = new MirrorDaemonReplyBackend({
      routeMeta: { agentId: "main", surface: "telegram" },
      env: {},
    });

    const reply = await backend.resolveReply({
      ctx: {
        Body: "fallback text",
        BodyForAgent: "normalized telegram text",
        BodyForCommands: "/help",
        RawBody: "/help",
        SessionKey: "agent:main:telegram:direct:123",
        AccountId: "telegram-main",
        MessageSidFull: "telegram-full-msg-id",
        ReplyToIdFull: "reply-full-id",
        ReplyToBody: "quoted",
        ReplyToSender: "alice",
        ReplyToIsQuote: true,
        From: "123",
        To: "456",
        SenderId: "42",
        SenderUsername: "alice_user",
        ChatType: "direct",
        Surface: "telegram",
        OriginatingChannel: "telegram",
        OriginatingTo: "123",
        MessageThreadId: 88,
        CommandAuthorized: true,
        WasMentioned: true,
        TelegramCtx: { update_id: 1 },
        grammYBot: { api: true },
      },
      replyOptions: { isHeartbeat: false },
    });

    expect(reply).toEqual({ text: "[mirror-daemon stub reply]" });
    expect(backend.getLastProjectedMirrorRequest()).toEqual({
      sessionKey: "agent:main:telegram:direct:123",
      agentId: "main",
      accountId: "telegram-main",
      surface: "telegram",
      text: "normalized telegram text",
      rawText: "/help",
      commandText: "/help",
      chatType: "direct",
      messageId: "telegram-full-msg-id",
      replyTo: {
        id: "reply-full-id",
        body: "quoted",
        sender: "alice",
        isQuote: true,
      },
      route: {
        originatingChannel: "telegram",
        originatingTo: "123",
        messageThreadId: 88,
      },
      sender: {
        from: "123",
        to: "456",
        senderId: "42",
        senderUsername: "alice_user",
      },
      flags: {
        wasMentioned: true,
        commandAuthorized: true,
        isHeartbeat: false,
      },
    });
    expect(backend.getLastProjectedMirrorRequest()).not.toHaveProperty("TelegramCtx");
    expect(backend.getLastProjectedMirrorRequest()).not.toHaveProperty("grammYBot");
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith("[mirror-daemon] backend invoked", {
      agentId: "main",
      sessionKey: "agent:main:telegram:direct:123",
      surface: "telegram",
    });
  });

  it("projects a WhatsApp-style request with attachments and omits channel protocol objects", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const backend = new MirrorDaemonReplyBackend({
      routeMeta: (ctx) => ({
        agentId: "main",
        accountId: ctx.AccountId,
        surface: ctx.Surface,
      }),
      runtimeClient: {
        executeReply: async () => ({ text: "[mirror-daemon stub reply]", isError: false }),
      },
      env: {},
    });

    const reply = await backend.resolveReply({
      ctx: {
        Body: "history body",
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
        MediaPath: "/tmp/audio.ogg",
        MediaUrl: "https://example.com/audio.ogg",
        MediaType: "audio/ogg",
        Transcript: "hello from voice note",
        OriginatingChannel: "whatsapp",
        OriginatingTo: "+15550001111",
        CommandAuthorized: false,
        socket: { ws: true },
        baileys: { jid: "abc" },
      },
      replyOptions: { isHeartbeat: true },
    });

    expect(reply).toEqual({ text: "[mirror-daemon stub reply]", isError: false });
    expect(backend.getLastProjectedMirrorRequest()).toEqual({
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
    expect(backend.getLastProjectedMirrorRequest()).not.toHaveProperty("socket");
    expect(backend.getLastProjectedMirrorRequest()).not.toHaveProperty("baileys");
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it("logs the projected request only when MIRROR_DAEMON_BACKEND_DEBUG=1", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const backend = new MirrorDaemonReplyBackend({
      routeMeta: { agentId: "main", surface: "whatsapp" },
      env: { MIRROR_DAEMON_BACKEND_DEBUG: "1" },
    });

    const reply = await backend.resolveReply({
      ctx: {
        Body: "fallback body",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:whatsapp:direct:+1555",
        Surface: "whatsapp",
        CommandAuthorized: false,
      },
      replyOptions: { isHeartbeat: true },
    });

    expect(reply).toEqual({ text: "[mirror-daemon stub reply]" });
    expect(backend.getLastProjectedMirrorRequest()).toEqual({
      sessionKey: "agent:main:whatsapp:direct:+1555",
      agentId: "main",
      surface: "whatsapp",
      text: "normalized text",
      commandText: "fallback body",
      flags: {
        commandAuthorized: false,
        isHeartbeat: true,
      },
    });
    expect(debugSpy).toHaveBeenCalledTimes(2);
    expect(debugSpy).toHaveBeenNthCalledWith(1, "[mirror-daemon] backend invoked", {
      agentId: "main",
      sessionKey: "agent:main:whatsapp:direct:+1555",
      surface: "whatsapp",
    });
    expect(debugSpy).toHaveBeenNthCalledWith(2, "[mirror-daemon] projected request", {
      sessionKey: "agent:main:whatsapp:direct:+1555",
      agentId: "main",
      surface: "whatsapp",
      text: "normalized text",
      commandText: "[redacted]",
      flags: {
        commandAuthorized: false,
        isHeartbeat: true,
      },
    });
  });

  it("passes the projected request to the runtime client", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const executeReply = vi.fn(async () => ({ text: "[executed stub]" }));

    const backend = new MirrorDaemonReplyBackend({
      routeMeta: { agentId: "main", surface: "telegram" },
      env: {},
      runtimeClient: { executeReply },
    });

    const reply = await backend.resolveReply({
      ctx: {
        Body: "fallback",
        BodyForAgent: "normalized",
        SessionKey: "agent:main:telegram:direct:42",
        AccountId: "telegram-main",
        Surface: "telegram",
        CommandAuthorized: true,
      },
      replyOptions: { isHeartbeat: false },
    });

    expect(reply).toEqual({ text: "[executed stub]" });
    expect(executeReply).toHaveBeenCalledTimes(1);
    expect(executeReply).toHaveBeenCalledWith({
      sessionKey: "agent:main:telegram:direct:42",
      agentId: "main",
      accountId: "telegram-main",
      surface: "telegram",
      text: "normalized",
      commandText: "fallback",
      flags: {
        commandAuthorized: true,
        isHeartbeat: false,
      },
    });
    expect(backend.getLastProjectedMirrorRequest()).toEqual(executeReply.mock.calls[0]?.[0]);
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the default stub execution reply unchanged", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const backend = new MirrorDaemonReplyBackend({
      routeMeta: { agentId: "main", surface: "whatsapp" },
      env: {},
    });

    const reply = await backend.resolveReply({
      ctx: {
        Body: "fallback body",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:whatsapp:direct:+1000",
        Surface: "whatsapp",
        CommandAuthorized: false,
      },
    });

    expect(reply).toEqual({ text: "[mirror-daemon stub reply]" });
    expect(backend.getLastProjectedMirrorRequest()).toEqual({
      sessionKey: "agent:main:whatsapp:direct:+1000",
      agentId: "main",
      surface: "whatsapp",
      text: "normalized text",
      commandText: "fallback body",
      flags: {
        commandAuthorized: false,
      },
    });
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it("uses StubMirrorRuntimeClient by default", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const executeReplySpy = vi.spyOn(StubMirrorRuntimeClient.prototype, "executeReply");
    const backend = new MirrorDaemonReplyBackend({
      routeMeta: { agentId: "main", surface: "whatsapp" },
      env: {},
    });

    const reply = await backend.resolveReply({
      ctx: {
        Body: "fallback body",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:whatsapp:direct:+1999",
        Surface: "whatsapp",
        CommandAuthorized: false,
      },
    });

    expect(executeReplySpy).toHaveBeenCalledTimes(1);
    expect(executeReplySpy).toHaveBeenCalledWith({
      sessionKey: "agent:main:whatsapp:direct:+1999",
      agentId: "main",
      surface: "whatsapp",
      text: "normalized text",
      commandText: "fallback body",
      flags: {
        commandAuthorized: false,
      },
    });
    expect(reply).toEqual({ text: "[mirror-daemon stub reply]" });
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });
});
