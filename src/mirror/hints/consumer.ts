export type MirrorHint = {
  type: "mirror_hint";
  ts: number;
  runId?: string;
  toolName: string;
  signature: string;
  repeats: number;
  hint: string;
};

export function consumeMirrorHints(params: {
  runId: string;
  hints: MirrorHint[];
  log?: { debug?: (message: string) => void; warn?: (message: string) => void };
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void | Promise<void>;
}): { nudges: string[] } {
  const seen = new Set<string>();
  const deduped: MirrorHint[] = [];

  for (const hint of params.hints) {
    const key = `${hint.toolName}\t${hint.signature}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(hint);
  }

  const nudges = deduped
    .slice()
    .toSorted((a, b) => b.repeats - a.repeats || b.ts - a.ts)
    .slice(0, 3)
    .map((hint) => `Adjust ${hint.toolName}: repeated tool_error (${hint.repeats}x).`);

  params.log?.debug?.(`[mirror_hints] runId=${params.runId} nudges=${nudges.length}`);
  return { nudges };
}
