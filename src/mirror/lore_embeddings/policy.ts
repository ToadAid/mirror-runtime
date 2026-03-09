export type MirrorEmbeddingSource = {
  path: string;
  trusted: boolean;
  reason?: string;
};

export function allowCanonical(path: string): MirrorEmbeddingSource {
  return { path, trusted: true };
}

export function rejectCanonical(path: string, reason: string): MirrorEmbeddingSource {
  return { path, trusted: false, reason };
}

export function rejectLocal(path: string): MirrorEmbeddingSource {
  return { path, trusted: false, reason: "local_lore_not_allowed" };
}
