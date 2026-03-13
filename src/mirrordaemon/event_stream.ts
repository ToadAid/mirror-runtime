import crypto from "node:crypto";
import type {
  MirrordaemonEventStream,
  MirrordaemonRuntimeEvent,
  MirrordaemonEventSubscription,
} from "./daemon_types.js";

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
