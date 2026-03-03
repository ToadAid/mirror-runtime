export type LoreForgeCandidate = {
  id: string;
  content: string;
  tags: string[];
};

export type LoreForgeScored = {
  candidate: LoreForgeCandidate;
  score: number;
  reason: string;
};

export function scoreCandidate(candidate: LoreForgeCandidate): LoreForgeScored {
  const tagCount = Array.isArray(candidate.tags) ? candidate.tags.length : 0;
  const score = 50 + Math.min(50, tagCount * 10);

return {
    candidate,
    score,
    reason: `Based on ${tagCount} tags`,
  };
}

export function scoreBatch(candidates: LoreForgeCandidate[]): LoreForgeScored[] {
  return (candidates || []).map(scoreCandidate);
}
