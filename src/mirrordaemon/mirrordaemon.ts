import { randomUUID } from "node:crypto";
import { createMirrorObservabilityContext } from "../mirror-observability/index.js";
import type { MirrorProviderPlane } from "../mirror-provider/index.js";
import type { MirrorServiceConfig } from "../mirror-service/config.js";
import type { MirrorServiceLifecycle } from "../mirror-service/lifecycle.js";
import { createBootSnapshot } from "./boot_snapshot.js";
import type {
  CreateMirrordaemonSessionInput,
  MirrordaemonBootSnapshot,
  MirrordaemonEventStream,
  MirrordaemonObservability,
  MirrordaemonSession,
  TouchMirrordaemonSessionInput,
} from "./daemon_types.js";
import { createRuntimeEventStream } from "./event_stream.js";
import { createSessionRegistry, type MirrordaemonSessionRegistry } from "./session_registry.js";

export type Mirrordaemon = MirrordaemonSessionRegistry &
  MirrordaemonEventStream &
  MirrordaemonObservability & {
    getBootSnapshot: () => MirrordaemonBootSnapshot;
  };

export function createMirrordaemon(params: {
  config: MirrorServiceConfig;
  lifecycle: MirrorServiceLifecycle;
  providerPlane?: MirrorProviderPlane;
  runtimeStartedAt?: string;
}): Mirrordaemon {
  const daemonSessionId = randomUUID();
  const bootSnapshot = createBootSnapshot({
    config: params.config,
    lifecycle: params.lifecycle,
    providerPlane: params.providerPlane,
    runtimeStartedAt: params.runtimeStartedAt,
    daemonSessionId,
  });
  const observability = createMirrorObservabilityContext();
  const sessions = createSessionRegistry();
  const events = createRuntimeEventStream();

  const daemon: Mirrordaemon = {
    getBootSnapshot() {
      return bootSnapshot;
    },
    getObservability() {
      return observability;
    },
    createSession(input?: CreateMirrordaemonSessionInput): MirrordaemonSession {
      const session = sessions.createSession(input);
      events.publishRuntimeEvent("session.created", {
        session_id: session.session_id,
        user_id: session.user_id,
      });
      return session;
    },
    getSession(sessionId) {
      return sessions.getSession(sessionId);
    },
    listSessions() {
      return sessions.listSessions();
    },
    touchSession(sessionId, input?: TouchMirrordaemonSessionInput) {
      const session = sessions.touchSession(sessionId, input);
      if (session) {
        events.publishRuntimeEvent("session.touched", {
          session_id: session.session_id,
          user_id: session.user_id,
        });
      }
      return session;
    },
    closeSession(sessionId, now?: string) {
      const session = sessions.closeSession(sessionId, now);
      if (session) {
        events.publishRuntimeEvent("session.closed", {
          session_id: session.session_id,
          user_id: session.user_id,
        });
      }
      return session;
    },
    publishRuntimeEvent: events.publishRuntimeEvent,
    subscribeRuntimeEvents: events.subscribeRuntimeEvents,
    getRecentEvents: events.getRecentEvents,
  };

  daemon.publishRuntimeEvent("runtime.started", {
    node_id: bootSnapshot.config.node_id,
    surfaces: bootSnapshot.enabled_surfaces,
  });

  return daemon;
}
