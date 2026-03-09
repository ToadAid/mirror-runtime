import type { PondAgent } from "./types.js";

type GitHubFork = {
  owner?: { login?: string };
  name?: string;
};

type GitHubContentResponse = {
  content?: string;
  encoding?: string;
};

const GITHUB_API_BASE = "https://api.github.com";

function isPondAgent(value: unknown): value is PondAgent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.agent_id === "string" &&
    typeof candidate.agent_name === "string" &&
    typeof candidate.builder === "string" &&
    typeof candidate.repo === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.pond_enabled === "boolean"
  );
}

function decodeBase64Content(content: string): string {
  const compact = content.replace(/\s+/g, "");
  return Buffer.from(compact, "base64").toString("utf8");
}

async function fetchForks(): Promise<GitHubFork[]> {
  console.log("[POND] discovering forks");
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/MirrorAgent1/lore-keeper/forks?per_page=100`,
    {
      headers: { Accept: "application/vnd.github+json" },
    },
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as GitHubFork[]) : [];
}

async function fetchPondAgent(owner: string, repo: string): Promise<PondAgent | null> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/pond-agent.json`,
    {
      headers: { Accept: "application/vnd.github+json" },
    },
  );

  if (response.status === 404 || !response.ok) {
    return null;
  }

  console.log("[POND] found pond-agent.json", `${owner}/${repo}`);

  const payload = (await response.json()) as GitHubContentResponse;
  if (payload.encoding !== "base64" || typeof payload.content !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Content(payload.content)) as unknown;
    return isPondAgent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function discoverPondAgents(): Promise<PondAgent[]> {
  let forks: GitHubFork[] = [];

  try {
    forks = await fetchForks();
  } catch {
    return [];
  }

  const results: PondAgent[] = [];

  for (const fork of forks) {
    const owner = fork.owner?.login;
    const repo = fork.name;
    if (!owner || !repo) {
      continue;
    }

    try {
      const agent = await fetchPondAgent(owner, repo);
      if (agent) {
        results.push(agent);
      }
    } catch {
      // Ignore per-fork failures and continue scanning.
    }
  }

  return results;
}
