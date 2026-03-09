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

export type RunVerifyLoreCliOptions = {
  manifestPath?: string;
  dir?: string;
  json?: boolean;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  write?: (text: string) => void;
};

export type MirrorLoreSignatureVerificationResult = {
  ok: boolean;
  reason?: string;
};

export type VerifyManifestSignatureOptions = {
  manifestPath: string;
  signaturePath?: string;
  publicKeyPem: string;
  readFile?: (path: string) => Promise<Buffer>;
};

export type LoadManifestAndSignatureOptions = {
  manifestPath: string;
  signaturePath?: string;
  readFile?: (path: string) => Promise<Buffer>;
};

export type LoadedManifestAndSignature = {
  manifestPath: string;
  signaturePath: string;
  manifestBytes: Buffer;
  signatureBytes: Buffer;
};
