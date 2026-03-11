import { MirrorDaemonClientError } from "./client.js";

export function formatMirrorDaemonCliError(action: string, error: unknown): Error {
  if (error instanceof MirrorDaemonClientError) {
    if (error.status === 401) {
      return new Error(
        `${action} failed: unauthorized. Hint: set MIRROR_DAEMON_TOKEN or send Authorization: Bearer <token>.`,
      );
    }
    if (error.status === 404) {
      return new Error(`${action} failed: ${error.message}`);
    }
    if (typeof error.status === "number") {
      return new Error(`${action} failed (HTTP ${error.status}): ${error.message}`);
    }
    return new Error(
      `${action} failed: daemon unavailable (${error.message}). Hint: run 'openclaw mirror-daemon start'.`,
    );
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(`${action} failed`);
}
