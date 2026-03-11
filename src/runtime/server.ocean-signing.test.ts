import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MirrorRuntimeConfigSnapshot } from "../mirror-daemon/runtime-config.js";
import { buildSignedPondManifest, fetchAndUpsertOceanPondManifest } from "./server.js";

type OceanRegistry = {
  ponds: Array<{
    pond_id: string;
    trust_status?: string;
    pubkey_id?: string;
    signature_ok?: boolean;
    [key: string]: unknown;
  }>;
};

function generatePemPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString("utf-8"),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString("utf-8"),
  };
}

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function withIsolatedWorkspace(
  run: (ctx: { root: string; oceanRegistryPath: string }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ocean-signing-"));
  const oceanRegistryPath = path.join(root, ".mirror", "ocean_registry.json");

  try {
    process.chdir(root);
    delete process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM;
    delete process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PATH;
    delete process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM;
    delete process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PATH;
    delete process.env.MIRROR_POND_ID;
    await run({ root, oceanRegistryPath });
  } finally {
    process.chdir(previousCwd);
    await fs.rm(root, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

afterEach(() => {
  delete process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM;
  delete process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PATH;
  delete process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM;
  delete process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PATH;
  delete process.env.MIRROR_POND_ID;
});

describe("ocean manifest signature verification and key pinning", () => {
  it("prefers injected runtime config snapshot over process env for manifest identity and signing", async () => {
    await withIsolatedWorkspace(async () => {
      const snapshotKeys = generatePemPair();
      const envKeys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = envKeys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = envKeys.publicKeyPem;
      process.env.MIRROR_POND_ID = "env-pond";
      process.env.MIRROR_POND_NAME = "Env Pond";
      process.env.MIRROR_POND_CONSULT_URL = "https://env.example/pond/consult";

      const runtimeConfig: MirrorRuntimeConfigSnapshot = {
        daemon: {
          host: "127.0.0.1",
          port: 8787,
          token: null,
          storeRoot: path.resolve(process.cwd(), ".mirror"),
          journalPath: path.resolve(process.cwd(), ".mirror", "run_journal.jsonl"),
        },
        provider: { name: "brain-chat", model: "gpt-4o-mini" },
        brain: {},
        runtime: {
          enabled: true,
          mode: "lan",
          name: "snapshot-runtime",
          version: "2026.03.10",
          commit: "snapshot-commit",
        },
        lore: {},
        pond: {
          id: "snapshot-pond",
          name: "Snapshot Pond",
          agents: ["main", "scribe"],
          consultUrl: "https://snapshot.example/pond/consult",
          signing: {
            privateKeyPem: snapshotKeys.privateKeyPem,
            publicKeyPem: snapshotKeys.publicKeyPem,
          },
        },
      };

      const manifest = await buildSignedPondManifest({
        nowIso: "2026-03-10T00:00:00.000Z",
        runtimeConfig,
      });

      expect(manifest.pond_id).toBe("snapshot-pond");
      expect(manifest.name).toBe("Snapshot Pond");
      expect(manifest.runtime).toBe("snapshot-runtime");
      expect(manifest.runtime_version).toBe("2026.03.10");
      expect(manifest.consult_url).toBe("https://snapshot.example/pond/consult");
    });
  });

  it("accepts valid signed manifest", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath }) => {
      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";

      const manifest = await buildSignedPondManifest({ nowIso: "2026-03-10T00:00:00.000Z" });
      const pond = await fetchAndUpsertOceanPondManifest({
        manifestUrl: "https://pond-a.example/pond/manifest",
        fetchFn: async () => createJsonResponse(manifest),
      });

      expect(pond.pond_id).toBe("pond-a");
      expect(pond.signature_ok).toBe(true);
      expect(typeof pond.pubkey_id).toBe("string");
      expect(typeof pond.last_handshake_at).toBe("string");
      expect(pond.last_signature_ok).toBe(true);
      expect(pond.remote_runtime).toBe(manifest.runtime);
      expect(pond.remote_ocean_protocol).toBe(manifest.ocean_protocol);

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as OceanRegistry;
      expect(persisted.ponds).toHaveLength(1);
      expect(persisted.ponds[0]?.signature_ok).toBe(true);
      expect(typeof persisted.ponds[0]?.last_handshake_at).toBe("string");
    });
  });

  it("rejects invalid signature", async () => {
    await withIsolatedWorkspace(async () => {
      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";

      const manifest = await buildSignedPondManifest();
      manifest.signature = manifest.signature.slice(0, -2) + "ab";

      await expect(
        fetchAndUpsertOceanPondManifest({
          manifestUrl: "https://pond-a.example/pond/manifest",
          fetchFn: async () => createJsonResponse(manifest),
        }),
      ).rejects.toThrow(/signature verification failed/);
    });
  });

  it("rejects missing signature fields", async () => {
    await withIsolatedWorkspace(async () => {
      const invalidManifest = {
        pond_id: "pond-a",
        name: "Pond A",
      };
      await expect(
        fetchAndUpsertOceanPondManifest({
          manifestUrl: "https://pond-a.example/pond/manifest",
          fetchFn: async () => createJsonResponse(invalidManifest),
        }),
      ).rejects.toThrow(/missing required field/);
    });
  });

  it("pins first pubkey_id and rejects silent key change", async () => {
    await withIsolatedWorkspace(async () => {
      const keyA = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keyA.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keyA.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const firstManifest = await buildSignedPondManifest({ nowIso: "2026-03-10T00:00:00.000Z" });

      await fetchAndUpsertOceanPondManifest({
        manifestUrl: "https://pond-a.example/pond/manifest",
        fetchFn: async () => createJsonResponse(firstManifest),
      });

      const keyB = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keyB.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keyB.publicKeyPem;
      const secondManifest = await buildSignedPondManifest({ nowIso: "2026-03-10T00:01:00.000Z" });

      await expect(
        fetchAndUpsertOceanPondManifest({
          manifestUrl: "https://pond-a.example/pond/manifest",
          fetchFn: async () => createJsonResponse(secondManifest),
        }),
      ).rejects.toThrow(/pubkey_id changed/);
    });
  });

  it("denies fetch for blocked pond and leaves trust_status unchanged", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "blocked" }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest();

      await expect(
        fetchAndUpsertOceanPondManifest({
          manifestUrl: "https://pond-a.example/pond/manifest",
          fetchFn: async () => createJsonResponse(manifest),
        }),
      ).rejects.toThrow(/manifest\.fetch denied/);

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as OceanRegistry;
      expect(persisted.ponds[0]?.trust_status).toBe("blocked");
      expect(persisted.ponds[0]?.signature_ok).toBeUndefined();
    });
  });

  it("allows fetch for known and trusted ponds", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "known" }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const firstManifest = await buildSignedPondManifest();

      const first = await fetchAndUpsertOceanPondManifest({
        manifestUrl: "https://pond-a.example/pond/manifest",
        fetchFn: async () => createJsonResponse(firstManifest),
      });
      expect(first.trust_status).toBe("known");

      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ ...first, trust_status: "trusted" }],
        })}\n`,
        "utf-8",
      );

      const secondManifest = await buildSignedPondManifest();
      const second = await fetchAndUpsertOceanPondManifest({
        manifestUrl: "https://pond-a.example/pond/manifest",
        fetchFn: async () => createJsonResponse(secondManifest),
      });
      expect(second.trust_status).toBe("trusted");
    });
  });

  it("does not auto-mutate trust_status during signature verification fetch", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "trusted" }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest();

      const pond = await fetchAndUpsertOceanPondManifest({
        manifestUrl: "https://pond-a.example/pond/manifest",
        fetchFn: async () => createJsonResponse(manifest),
      });

      expect(pond.trust_status).toBe("trusted");

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as OceanRegistry;
      expect(persisted.ponds[0]?.trust_status).toBe("trusted");
      expect(persisted.ponds[0]?.signature_ok).toBe(true);
    });
  });
});
