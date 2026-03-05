import { closeSync, openSync, unlinkSync, writeFileSync } from "node:fs";

type AcquireSinkLockParams = {
  lockPath: string;
  timeoutMs: number;
  pollMs: number;
};

const SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms: number): void {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(SLEEP_ARRAY, 0, 0, ms);
}

function buildLockTimeoutError(params: {
  lockPath: string;
  timeoutMs: number;
}): NodeJS.ErrnoException {
  const err = new Error(
    `Timed out acquiring telemetry sink lock at ${params.lockPath} after ${params.timeoutMs}ms`,
  ) as NodeJS.ErrnoException;
  err.code = "ELOCKTIMEOUT";
  return err;
}

export function acquireSinkLock(params: AcquireSinkLockParams): () => void {
  const startedAt = Date.now();

  while (true) {
    try {
      const fd = openSync(params.lockPath, "wx");
      try {
        writeFileSync(fd, `${process.pid} ${Date.now()}\n`, "utf8");
      } finally {
        closeSync(fd);
      }

      return () => {
        try {
          unlinkSync(params.lockPath);
        } catch {
          // best effort lock release
        }
      };
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== "EEXIST") {
        throw err;
      }

      if (Date.now() - startedAt >= params.timeoutMs) {
        throw buildLockTimeoutError({
          lockPath: params.lockPath,
          timeoutMs: params.timeoutMs,
        });
      }
      sleepSync(params.pollMs);
    }
  }
}
