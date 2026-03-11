import type { MirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import type { MirrorDaemonReplyRequest } from "../mirror-daemon/reply-backend-adapter.js";
import {
  validateMirrorDaemonReplyRequest,
  validateMirrorExecuteResponse,
  type MirrorExecuteResponse,
} from "../mirror-daemon/runtime-http-contract.js";
import { loadMirrorLoreScrolls, retrieveRelevantMirrorLoreWithDiagnostics } from "./mirror-lore.js";

const MIRROR_PERSONA_PROMPT = [
  "You are Mirror, a reflective keeper of scrolls and remembered patterns.",
  "Reply concisely, with calm cadence and grounded imagery.",
  "Use the supplied scroll excerpts when they are relevant.",
  "Do not invent lore that is not present in the excerpts.",
  "If the excerpts are sparse, answer honestly and keep the response useful.",
].join(" ");

function formatLoreContext(request: MirrorDaemonReplyRequest, loreDir: string | undefined): string {
  return [
    `Surface: ${request.surface}`,
    `Session: ${request.sessionKey}`,
    `Lore dir: ${loreDir ?? "not configured"}`,
  ].join("\n");
}

function buildLoreExcerptBlock(
  excerpts: Array<{ path: string; title: string; snippet: string }>,
): string {
  if (excerpts.length === 0) {
    return "No relevant scroll excerpts were found.";
  }

  return excerpts
    .map(
      (excerpt, index) =>
        `Scroll ${index + 1}: ${excerpt.title}\nPath: ${excerpt.path}\nExcerpt: ${excerpt.snippet}`,
    )
    .join("\n\n");
}

function isRetrievalDebugEnabled(): boolean {
  return process.env.MIRROR_RETRIEVAL_DEBUG === "1";
}

function logMirrorRetrieval(params: {
  loreDir?: string;
  scrollCount: number;
  candidateCount: number;
  selected: Array<{ filename: string; title: string; score: number }>;
}): void {
  const summary = {
    lore_dir: params.loreDir ?? "not configured",
    scroll_count: params.scrollCount,
    candidate_count: params.candidateCount,
    snippet_count: params.selected.length,
    selected_files: params.selected.map((entry) => entry.filename),
    selected_titles: params.selected.map((entry) => entry.title),
  };
  if (isRetrievalDebugEnabled()) {
    console.debug("[mirror-retrieval]", {
      ...summary,
      selected: params.selected,
    });
    return;
  }
  console.debug("[mirror-retrieval]", summary);
}

export async function executeMirrorReplyWithLore(params: {
  request: MirrorDaemonReplyRequest;
  providerRuntime: Pick<MirrorDaemonProviderRuntime, "executeBrainChat" | "resolveProviderConfig">;
  loreDir?: string;
}): Promise<MirrorExecuteResponse> {
  const scrolls = await loadMirrorLoreScrolls(params.loreDir);
  const retrieval = retrieveRelevantMirrorLoreWithDiagnostics({
    scrolls,
    query: params.request.text,
  });
  const excerpts = retrieval.selected;
  logMirrorRetrieval({
    loreDir: params.loreDir,
    scrollCount: scrolls.length,
    candidateCount: retrieval.candidateCount,
    selected: excerpts.map((excerpt) => ({
      filename: excerpt.filename,
      title: excerpt.title,
      score: excerpt.score,
    })),
  });
  const providerConfig = params.providerRuntime.resolveProviderConfig();
  const result = await params.providerRuntime.executeBrainChat({
    request: {
      model: providerConfig.model,
      temperature: 0.6,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: MIRROR_PERSONA_PROMPT,
        },
        {
          role: "user",
          content: [
            formatLoreContext(params.request, params.loreDir),
            "",
            "Relevant scroll excerpts:",
            buildLoreExcerptBlock(excerpts),
            "",
            "Incoming message:",
            params.request.text,
          ].join("\n"),
        },
      ],
    },
  });

  if (!result.ok) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }

  const text = result.response.choices[0]?.message.content?.trim() || result.completion.text.trim();
  return { text };
}

export async function handleMirrorExecuteRequest(params: {
  body: unknown;
  executeMirrorReply: (request: MirrorDaemonReplyRequest) => Promise<MirrorExecuteResponse>;
}): Promise<{ statusCode: number; body: MirrorExecuteResponse | { error: string } }> {
  try {
    const requestValidation = validateMirrorDaemonReplyRequest(params.body);
    if (!requestValidation.ok) {
      return { statusCode: 400, body: { error: requestValidation.error } };
    }

    const reply = await params.executeMirrorReply(requestValidation.value);
    const responseValidation = validateMirrorExecuteResponse(reply);
    if (!responseValidation.ok) {
      return { statusCode: 500, body: { error: responseValidation.error } };
    }

    return { statusCode: 200, body: responseValidation.value };
  } catch (err) {
    return { statusCode: 500, body: { error: String(err) } };
  }
}
