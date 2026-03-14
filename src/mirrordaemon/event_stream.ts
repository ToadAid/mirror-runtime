import crypto from "node:crypto";
import type {
  MirrordaemonEventStream,
  MirrordaemonRuntimeEvent,
  MirrordaemonEventSubscription,
} from "./daemon_types.js";

function extractCorrelation(payload: Record<string, unknown>) {
  const trace_id = typeof payload.trace_id === "string" ? payload.trace_id : undefined;
  if (!trace_id) {
    return undefined;
  }
  return {
    trace_id,
    session_id: typeof payload.session_id === "string" ? payload.session_id : undefined,
    action_id: typeof payload.action_id === "string" ? payload.action_id : undefined,
    provider_id: typeof payload.provider_id === "string" ? payload.provider_id : undefined,
  };
}

export function createRuntimeEventStream(maxEvents = 100): MirrordaemonEventStream {
  const listeners = new Set<(event: MirrordaemonRuntimeEvent) => void>();
  const recentEvents: MirrordaemonRuntimeEvent[] = [];

  function publishRuntimeEvent(
    type: string,
    payload: Record<string, unknown> = {},
  ): MirrordaemonRuntimeEvent {
    const event: MirrordaemonRuntimeEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      correlation: extractCorrelation(payload),
      payload,
    };
    recentEvents.unshift(event);
    if (recentEvents.length > maxEvents) {
      recentEvents.length = maxEvents;
    }
    for (const listener of listeners) {
      listener(event);
    }
    return event;
  }

  function subscribeRuntimeEvents(
    listener: (event: MirrordaemonRuntimeEvent) => void,
  ): MirrordaemonEventSubscription {
    listeners.add(listener);
    return {
      unsubscribe() {
        listeners.delete(listener);
      },
    };
  }

  return {
    publishRuntimeEvent,
    subscribeRuntimeEvents,
    getRecentEvents() {
      return [...recentEvents];
    },
  };
}
