export type {
  MirrorLoreManifest,
  MirrorLoreManifestEntry,
  MirrorLoreManifestMismatch,
  MirrorLoreManifestVerificationReport,
  MirrorLoreSignatureVerificationResult,
  LoadedManifestAndSignature,
  LoadManifestAndSignatureOptions,
  VerifyManifestSignatureOptions,
  VerifyLoreManifestOptions,
} from "./types.js";

export { sha256File } from "./hash.js";
export { verifyLoreManifest } from "./verify.js";
export {
  DEFAULT_LORE_CANONICAL_DIR,
  DEFAULT_LORE_MANIFEST_PATH,
  formatVerifyLoreHuman,
  runVerifyLoreCli,
} from "./cli.js";
export { loadManifestAndSignature, verifyManifestSignature } from "./signature.js";
