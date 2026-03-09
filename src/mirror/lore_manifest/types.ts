export type MirrorLoreManifestEntry = {
  path: string;
  sha256: string;
};

export type MirrorLoreManifest = {
  version: string;
  canonicalDir: string;
  scrolls: MirrorLoreManifestEntry[];
};

export type MirrorLoreManifestMismatch = {
  path: string;
  expected: string;
  actual: string;
};

export type MirrorLoreManifestVerificationReport = {
  ok: boolean;
  checked: number;
  matched: number;
  missing: string[];
  mismatched: MirrorLoreManifestMismatch[];
};

export type VerifyLoreManifestOptions = {
  manifest: MirrorLoreManifest;
  baseDir: string;
};
