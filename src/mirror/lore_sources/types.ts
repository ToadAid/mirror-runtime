export type MirrorLoreSourceKind = "canonical" | "local";

export type MirrorLoreDiscoveredFile = {
  path: string;
  kind: MirrorLoreSourceKind;
};

export type MirrorLorePolicy = {
  canonicalDir: string;
  localDir: string;
  includeLocal: boolean;
};
