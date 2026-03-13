import crypto from "node:crypto";
import type {
  CreateMirrordaemonSessionInput,
  MirrordaemonSession,
  TouchMirrordaemonSessionInput,
} from "./daemon_types.js";

export type MirrordaemonSessionRegistry = {
  createSession: (input?: CreateMirrordaemonSessionInput) => MirrordaemonSession;
  getSession: (sessionId: string) => MirrordaemonSession | undefined;
  listSessions: () => MirrordaemonSession[];
  touchSession: (
    sessionId: string,
    input?: TouchMirrordaemonSessionInput,
  ) => MirrordaemonSession | undefined;
  closeSession: (sessionId: string, now?: string) => MirrordaemonSession | undefined;
};

function mergeMetadata(
  current: Record<string, unknown>,
  next?: Record<string, unknown>,
): Record<string, unknown> {
  return next ? { ...current, ...next } : { ...current };
}

export function createSessionRegistry(): MirrordaemonSessionRegistry {
  const sessions = new Map<string, MirrordaemonSession>();

  return {
    createSession(input = {}) {
      const now = input.now ?? new Date().toISOString();
      const session: MirrordaemonSession = {
        session_id: input.session_id ?? crypto.randomUUID(),
        user_id: input.user_id,
        created_at: now,
        last_activity_at: now,
        status: "open",
        metadata: input.metadata ? { ...input.metadata } : {},
      };
      sessions.set(session.session_id, session);
      return session;
    },
    getSession(sessionId) {
      return sessions.get(sessionId);
    },
    listSessions() {
      return [...sessions.values()].toSorted((a, b) =>
        b.last_activity_at.localeCompare(a.last_activity_at),
      );
    },
    touchSession(sessionId, input = {}) {
      const session = sessions.get(sessionId);
      if (!session) {
        return undefined;
      }
      session.last_activity_at = input.now ?? new Date().toISOString();
      if (input.user_id) {
        session.user_id = input.user_id;
      }
      session.metadata = mergeMetadata(session.metadata, input.metadata);
      return session;
    },
    closeSession(sessionId, now = new Date().toISOString()) {
      const session = sessions.get(sessionId);
      if (!session) {
        return undefined;
      }
      session.status = "closed";
      session.last_activity_at = now;
      return session;
    },
  };
}
