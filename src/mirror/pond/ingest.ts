import type { PondDispatchRequest, PondDispatchResponse } from "./messages.js";

type GitHubIssueComment = {
  body?: unknown;
};

function extractSection(
  text: string,
  sectionName: string,
  nextSectionNames: string[],
): string | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const findHeader = (name: string): number =>
    lines.findIndex((line) => line.trim().toLowerCase() === name.toLowerCase());

  const start = findHeader(sectionName);
  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (const next of nextSectionNames) {
    const idx = findHeader(next);
    if (idx > start && idx < end) {
      end = idx;
    }
  }

  const content = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  return content.length > 0 ? content : null;
}

export async function fetchPondIssueComments(
  repo: string,
  issue_number: number,
): Promise<Array<{ body: string }>> {
  if (!repo || issue_number <= 0 || !Number.isFinite(issue_number)) {
    return [];
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("[POND] transport failed", "missing GITHUB_TOKEN");
    return [];
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issue_number}/comments`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      console.log("[POND] transport failed", `HTTP ${response.status}`);
      return [];
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) => {
        const body = (entry as GitHubIssueComment).body;
        return typeof body === "string" ? { body } : null;
      })
      .filter((entry): entry is { body: string } => entry !== null);
  } catch (err) {
    console.log("[POND] transport failed", String(err));
    return [];
  }
}

export function parsePondResponseFromComment(
  commentBody: string,
  req: PondDispatchRequest,
): PondDispatchResponse | null {
  const signal = extractSection(commentBody, "Signal", ["Reflection", "Sources"]);
  const reflection = extractSection(commentBody, "Reflection", ["Sources"]);

  if (!signal || !reflection) {
    return null;
  }

  const sourcesBlock = extractSection(commentBody, "Sources", []);
  const sources =
    sourcesBlock
      ?.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[-*]\s*/, "")) ?? [];

  return {
    from: req.to,
    to: req.from,
    type: "lore_response",
    trace_id: req.trace_id,
    signal,
    reflection,
    sources,
  };
}
