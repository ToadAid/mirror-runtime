import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildMirrorOperatorEnv } from "./operator_env.js";

const execFileAsync = promisify(execFile);

export async function runMirrorWeb(options: { openBrowser?: boolean } = {}): Promise<string> {
  const env = await buildMirrorOperatorEnv();
  const url = `http://127.0.0.1:${env.port}/mirror/ui/app`;
  const shouldOpen = options.openBrowser !== false;

  if (shouldOpen) {
    try {
      await execFileAsync("xdg-open", [url]);
      return `Mirror Web UI opened: ${url}\n`;
    } catch {
      return `Mirror Web UI: ${url}\n`;
    }
  }

  return `Mirror Web UI: ${url}\n`;
}
