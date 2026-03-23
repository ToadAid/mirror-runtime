import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import {
  getMirrordaemonRuntimeState,
  type Mirrordaemon,
  type MirrordaemonRuntimeEvent,
} from "../mirrordaemon/index.js";

export const MIRROR_RUNTIME_WS_PROTOCOL = "mirror.runtime.ws.v1";
export const MIRROR_RUNTIME_WS_PATH = "/mirror/runtime/ws";
const RUNTIME_EVENT_STREAM = "runtime.events";

export type MirrorRuntimeWsHelloEnvelope = {
  protocol: typeof MIRROR_RUNTIME_WS_PROTOCOL;
  type: "hello";
  connection_id: string;
  node_id: string;
  runtime_started_at: string;
  stream: typeof RUNTIME_EVENT_STREAM;
};

export type MirrorRuntimeWsSubscribedEnvelope = {
  protocol: typeof MIRROR_RUNTIME_WS_PROTOCOL;
  type: "subscribed";
  connection_id: string;
  stream: typeof RUNTIME_EVENT_STREAM;
  backlog_sent: number;
};

export type MirrorRuntimeWsRuntimeEventEnvelope = {
  protocol: typeof MIRROR_RUNTIME_WS_PROTOCOL;
  type: "runtime.event";
  connection_id: string;
  stream: typeof RUNTIME_EVENT_STREAM;
  event: MirrordaemonRuntimeEvent;
};

export type MirrorRuntimeWsPongEnvelope = {
  protocol: typeof MIRROR_RUNTIME_WS_PROTOCOL;
  type: "pong";
  connection_id: string;
  ts?: string;
};

export type MirrorRuntimeWsErrorEnvelope = {
  protocol: typeof MIRROR_RUNTIME_WS_PROTOCOL;
  type: "error";
  connection_id: string;
  code: string;
  message: string;
};

export type MirrorRuntimeWsEnvelope =
  | MirrorRuntimeWsHelloEnvelope
  | MirrorRuntimeWsSubscribedEnvelope
  | MirrorRuntimeWsRuntimeEventEnvelope
  | MirrorRuntimeWsPongEnvelope
  | MirrorRuntimeWsErrorEnvelope;

export type MirrorRuntimeWebSocketServer = {
  path: typeof MIRROR_RUNTIME_WS_PATH;
  protocol: typeof MIRROR_RUNTIME_WS_PROTOCOL;
  handleUpgrade: (req: http.IncomingMessage, socket: Duplex, head: Buffer) => boolean;
  getConnectionCount: () => number;
  close: () => Promise<void>;
};

function sendEnvelope(ws: WebSocket, envelope: MirrorRuntimeWsEnvelope): void {
  if (ws.readyState !== ws.OPEN) {
    return;
  }
  ws.send(JSON.stringify(envelope));
}

function buildRuntimeEventEnvelope(
  connectionId: string,
  event: MirrordaemonRuntimeEvent,
): MirrorRuntimeWsRuntimeEventEnvelope {
  return {
    protocol: MIRROR_RUNTIME_WS_PROTOCOL,
    type: "runtime.event",
    connection_id: connectionId,
    stream: RUNTIME_EVENT_STREAM,
    event,
  };
}

function parseBooleanQuery(value: string | null): boolean {
  if (value === null) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

function decodeWebSocketPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString("utf8");
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString("utf8");
  }
  throw new Error("Unsupported Mirror runtime websocket payload");
}

export function createMirrorRuntimeWebSocketServer(params: {
  server: http.Server;
  daemon: Mirrordaemon;
}): MirrorRuntimeWebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();

  wss.on("connection", (ws, req) => {
    sockets.add(ws);
    const connectionId = randomUUID();
    const runtime = getMirrordaemonRuntimeState(params.daemon);
    const url = new URL(req.url ?? MIRROR_RUNTIME_WS_PATH, "http://127.0.0.1");

    params.daemon.publishRuntimeEvent("runtime.ws.connected", {
      connection_id: connectionId,
      path: MIRROR_RUNTIME_WS_PATH,
    });

    sendEnvelope(ws, {
      protocol: MIRROR_RUNTIME_WS_PROTOCOL,
      type: "hello",
      connection_id: connectionId,
      node_id: runtime.node_id,
      runtime_started_at: runtime.runtime_started_at,
      stream: RUNTIME_EVENT_STREAM,
    });

    const backlogEnabled = parseBooleanQuery(url.searchParams.get("backlog"));
    let backlogSent = 0;
    if (backlogEnabled) {
      for (const event of params.daemon.getRecentEvents().toReversed()) {
        sendEnvelope(ws, buildRuntimeEventEnvelope(connectionId, event));
        backlogSent += 1;
      }
    }

    sendEnvelope(ws, {
      protocol: MIRROR_RUNTIME_WS_PROTOCOL,
      type: "subscribed",
      connection_id: connectionId,
      stream: RUNTIME_EVENT_STREAM,
      backlog_sent: backlogSent,
    });

    const subscription = params.daemon.subscribeRuntimeEvents((event) => {
      sendEnvelope(ws, buildRuntimeEventEnvelope(connectionId, event));
    });

    ws.on("message", (payload) => {
      try {
        const message = JSON.parse(decodeWebSocketPayload(payload)) as Record<string, unknown>;
        if (message.type === "ping") {
          sendEnvelope(ws, {
            protocol: MIRROR_RUNTIME_WS_PROTOCOL,
            type: "pong",
            connection_id: connectionId,
            ts: typeof message.ts === "string" ? message.ts : undefined,
          });
          return;
        }
        if (message.type === "subscribe") {
          const shouldReplayBacklog =
            typeof message.backlog === "boolean" ? message.backlog : false;
          let replayed = 0;
          if (shouldReplayBacklog) {
            for (const event of params.daemon.getRecentEvents().toReversed()) {
              sendEnvelope(ws, buildRuntimeEventEnvelope(connectionId, event));
              replayed += 1;
            }
          }
          sendEnvelope(ws, {
            protocol: MIRROR_RUNTIME_WS_PROTOCOL,
            type: "subscribed",
            connection_id: connectionId,
            stream: RUNTIME_EVENT_STREAM,
            backlog_sent: replayed,
          });
          return;
        }
        sendEnvelope(ws, {
          protocol: MIRROR_RUNTIME_WS_PROTOCOL,
          type: "error",
          connection_id: connectionId,
          code: "unsupported_message",
          message: "Unsupported Mirror runtime websocket message",
        });
      } catch {
        sendEnvelope(ws, {
          protocol: MIRROR_RUNTIME_WS_PROTOCOL,
          type: "error",
          connection_id: connectionId,
          code: "invalid_json",
          message: "Invalid Mirror runtime websocket payload",
        });
      }
    });

    ws.on("close", () => {
      subscription.unsubscribe();
      sockets.delete(ws);
      params.daemon.publishRuntimeEvent("runtime.ws.disconnected", {
        connection_id: connectionId,
        path: MIRROR_RUNTIME_WS_PATH,
      });
    });

    ws.on("error", () => {
      // connection cleanup is handled by close
    });
  });

  params.server.on("upgrade", (req, socket, head) => {
    const handled = new URL(req.url ?? "/", "http://127.0.0.1").pathname === MIRROR_RUNTIME_WS_PATH;
    if (!handled) {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  return {
    path: MIRROR_RUNTIME_WS_PATH,
    protocol: MIRROR_RUNTIME_WS_PROTOCOL,
    handleUpgrade(req, socket, head) {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== MIRROR_RUNTIME_WS_PATH) {
        return false;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return true;
    },
    getConnectionCount() {
      return sockets.size;
    },
    async close() {
      for (const socket of sockets) {
        socket.close();
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
