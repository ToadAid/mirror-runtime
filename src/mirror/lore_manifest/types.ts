export type MirrorLoreManifestEntry = {
  path: string;
  sha256: string;
};

export type LoreManifestEntry = MirrorLoreManifestEntry;

export type MirrorLoreManifest = {
  version: string;
  canonicalDir: string;
  scrolls: MirrorLoreManifestEntry[];
};

export type LoreManifest = {
  version: number;
  files: LoreManifestEntry[];
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

export type LoreVerifyResult = {
  checked: number;
  matched: number;
  missing: string[];
  mismatched: string[];
};

export type VerifyLoreManifestOptions = {
  manifest: MirrorLoreManifest;
  baseDir: string;
};

export type RunVerifyLoreCliOptions = {
  manifestPath?: string;
  dir?: string;
  json?: boolean;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  write?: (text: string) => void;
};
