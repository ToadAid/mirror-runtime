import { verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  LoadedManifestAndSignature,
  LoadManifestAndSignatureOptions,
  MirrorLoreSignatureVerificationResult,
  VerifyManifestSignatureOptions,
} from "./types.js";

function resolveSignaturePath(manifestPath: string, signaturePath?: string): string {
  if (signaturePath && signaturePath.trim().length > 0) {
    return signaturePath;
  }
  const parsed = path.parse(manifestPath);
  return path.join(parsed.dir, `${parsed.base}.sig`);
}

export async function loadManifestAndSignature(
  opts: LoadManifestAndSignatureOptions,
): Promise<LoadedManifestAndSignature> {
  if (!opts || typeof opts !== "object") {
    throw new TypeError("loadManifestAndSignature: options are required");
  }
  if (typeof opts.manifestPath !== "string" || opts.manifestPath.trim().length === 0) {
    throw new TypeError("loadManifestAndSignature: manifestPath must be a non-empty string");
  }

  const readBinary = opts.readFile ?? ((filePath: string) => readFile(filePath));
  const signaturePath = resolveSignaturePath(opts.manifestPath, opts.signaturePath);
  const [manifestBytes, signatureBytes] = await Promise.all([
    readBinary(opts.manifestPath),
    readBinary(signaturePath),
  ]);

  return {
    manifestPath: opts.manifestPath,
    signaturePath,
    manifestBytes,
    signatureBytes,
  };
}

export async function verifyManifestSignature(
  opts: VerifyManifestSignatureOptions,
): Promise<MirrorLoreSignatureVerificationResult> {
  if (!opts || typeof opts !== "object") {
    throw new TypeError("verifyManifestSignature: options are required");
  }
  if (typeof opts.manifestPath !== "string" || opts.manifestPath.trim().length === 0) {
    throw new TypeError("verifyManifestSignature: manifestPath must be a non-empty string");
  }
  if (typeof opts.publicKeyPem !== "string" || opts.publicKeyPem.trim().length === 0) {
    throw new TypeError("verifyManifestSignature: publicKeyPem must be a non-empty string");
  }

  let loaded: LoadedManifestAndSignature;
  try {
    loaded = await loadManifestAndSignature({
      manifestPath: opts.manifestPath,
      signaturePath: opts.signaturePath,
      readFile: opts.readFile,
    });
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException;
    if (maybeErr?.code === "ENOENT") {
      return {
        ok: false,
        reason: "missing_manifest_or_signature",
      };
    }
    throw error;
  }

  const signatureBase64 = loaded.signatureBytes.toString("utf8").trim();
  if (signatureBase64.length === 0) {
    return {
      ok: false,
      reason: "invalid_signature_encoding",
    };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, "base64");
  } catch {
    return {
      ok: false,
      reason: "invalid_signature_encoding",
    };
  }

  if (signature.length === 0) {
    return {
      ok: false,
      reason: "invalid_signature_encoding",
    };
  }

  let ok = false;
  try {
    ok = verify("sha256", loaded.manifestBytes, opts.publicKeyPem, signature);
  } catch {
    return {
      ok: false,
      reason: "invalid_public_key",
    };
  }

  if (!ok) {
    return {
      ok: false,
      reason: "signature_mismatch",
    };
  }

  return { ok: true };
}
