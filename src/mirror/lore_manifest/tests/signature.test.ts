import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyManifestSignature } from "../signature.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-signature-"));
  tempDirs.push(dir);
  return dir;
}

function createSigningPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
}

async function writeSignedManifest(
  dir: string,
  manifestContent: string,
  privateKey: ReturnType<typeof createSigningPair>["privateKey"],
): Promise<{ manifestPath: string; signaturePath: string }> {
  const manifestPath = path.join(dir, "manifest.json");
  const signaturePath = path.join(dir, "manifest.json.sig");

  const manifestBytes = Buffer.from(manifestContent, "utf8");
  const signature = sign("sha256", manifestBytes, privateKey);

  await fs.writeFile(manifestPath, manifestBytes);
  await fs.writeFile(signaturePath, signature.toString("base64"), "utf8");

  return { manifestPath, signaturePath };
}

describe("verifyManifestSignature", () => {
  it("returns ok=true for a valid signature", async () => {
    const dir = await createTempDir();
    const { privateKey, publicKey } = createSigningPair();
    const { manifestPath } = await writeSignedManifest(
      dir,
      '{"version":"2026-03-06"}\n',
      privateKey,
    );

    const result = await verifyManifestSignature({
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(result).toEqual({ ok: true });
  });

  it("returns ok=false when manifest is modified after signing", async () => {
    const dir = await createTempDir();
    const { privateKey, publicKey } = createSigningPair();
    const { manifestPath } = await writeSignedManifest(
      dir,
      '{"version":"2026-03-06"}\n',
      privateKey,
    );

    await fs.writeFile(manifestPath, '{"version":"2026-03-07"}\n', "utf8");

    const result = await verifyManifestSignature({
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("returns ok=false when signature file is missing", async () => {
    const dir = await createTempDir();
    const { privateKey, publicKey } = createSigningPair();
    const { manifestPath, signaturePath } = await writeSignedManifest(
      dir,
      '{"version":"2026-03-06"}\n',
      privateKey,
    );

    await fs.rm(signaturePath);

    const result = await verifyManifestSignature({
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_manifest_or_signature");
  });

  it("returns ok=false when using the wrong public key", async () => {
    const dir = await createTempDir();
    const { privateKey } = createSigningPair();
    const wrongKeyPair = createSigningPair();
    const { manifestPath } = await writeSignedManifest(
      dir,
      '{"version":"2026-03-06"}\n',
      privateKey,
    );

    const result = await verifyManifestSignature({
      manifestPath,
      publicKeyPem: wrongKeyPair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });
});
