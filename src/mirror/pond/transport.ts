import { resolvePondAgent } from "./dispatch.js";
import type { PondDispatchRequest } from "./messages.js";

export type PondTransportResult = {
  delivered: boolean;
  mode: "github-issue";
  repo: string | null;
  trace_id: string;
  issue_number?: number;
  request: PondDispatchRequest;
};

export function buildPondIssueTitle(req: PondDispatchRequest): string {
  return `[POND] ${req.type} from ${req.from} (${req.trace_id})`;
}

export function buildPondIssueBody(req: PondDispatchRequest): string {
  return [
    "# Pond Dispatch",
    "",
    `from: ${req.from}`,
    `to: ${req.to}`,
    `type: ${req.type}`,
    `trace_id: ${req.trace_id}`,
    "",
    "message:",
    req.message,
  ].join("\n");
}

export async function dispatchViaGitHubIssue(
  req: PondDispatchRequest,
): Promise<PondTransportResult> {
  const target = resolvePondAgent(req.to);
  if (!target) {
    return {
      delivered: false,
      mode: "github-issue",
      repo: null,
      trace_id: req.trace_id,
      request: req,
    };
  }

  console.log("[POND] dispatch transport github issue target=", target.repo);

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("[POND] transport failed", "missing GITHUB_TOKEN");
    return {
      delivered: false,
      mode: "github-issue",
      repo: target.repo,
      trace_id: req.trace_id,
      request: req,
    };
  }

  const payload = {
    title: buildPondIssueTitle(req),
    body: buildPondIssueBody(req),
  };

  try {
    const response = await fetch(`https://api.github.com/repos/${target.repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.log("[POND] transport failed", `HTTP ${response.status}`);
      return {
        delivered: false,
        mode: "github-issue",
        repo: target.repo,
        trace_id: req.trace_id,
        request: req,
      };
    }

    const data = (await response.json()) as { number?: unknown };
    const issue_number = typeof data.number === "number" ? data.number : undefined;

    console.log("[POND] issue created", issue_number ?? "unknown");

    return {
      delivered: true,
      mode: "github-issue",
      repo: target.repo,
      trace_id: req.trace_id,
      issue_number,
      request: req,
    };
  } catch (err) {
    console.log("[POND] transport failed", String(err));
    return {
      delivered: false,
      mode: "github-issue",
      repo: target.repo,
      trace_id: req.trace_id,
      request: req,
    };
  }
}
