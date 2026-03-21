import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { resolveMirrorTraceId } from "../mirror-runtime/index.js";
import type { Mirrordaemon } from "../mirrordaemon/index.js";

export function shouldTrackMirrorSession(pathname: string): boolean {
  return (
    pathname.startsWith("/mirror/chat") ||
    pathname.startsWith("/mirror/tools") ||
    pathname.startsWith("/mirror/console/api/chat") ||
    pathname.startsWith("/mirror/console/api/tools")
  );
}

export function createMirrorSessionIngressMiddleware(daemon: Mirrordaemon): RequestHandler {
  return (req, res, next) => {
    if (!shouldTrackMirrorSession(req.path)) {
      next();
      return;
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const sessionFromBody = typeof body.session_id === "string" ? body.session_id : undefined;
    const sessionFromHeader = req.header("x-mirror-session-id") ?? undefined;
    const traceId = resolveMirrorTraceId(
      req.header("x-mirror-trace-id") ?? undefined,
      typeof body.trace_id === "string" ? body.trace_id : undefined,
    );
    const sessionId = sessionFromHeader ?? sessionFromBody ?? crypto.randomUUID();
    const sessionUserId =
      typeof body.user_id === "string"
        ? body.user_id
        : body.session && typeof body.session === "object"
          ? ((body.session as { user_id?: unknown }).user_id as string | undefined)
          : undefined;
    const existing = daemon.getSession(sessionId);
    if (existing) {
      daemon.touchSession(sessionId, {
        user_id: sessionUserId,
        metadata: { path: req.path, method: req.method, trace_id: traceId },
      });
    } else {
      daemon.createSession({
        session_id: sessionId,
        user_id: sessionUserId,
        metadata: { path: req.path, method: req.method, trace_id: traceId },
      });
    }
    res.setHeader("x-mirror-session-id", sessionId);
    res.setHeader("x-mirror-trace-id", traceId);
    next();
  };
}
