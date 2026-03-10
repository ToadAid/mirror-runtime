import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetOceanConsultCacheForTests,
  buildSignedPondManifest,
  consultOceanPond,
} from "./server.js";

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

function toFetchUrlText(url: URL | string): string {
  return url instanceof URL ? url.toString() : url;
}

function stringifyLastError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.description ?? "symbol";
  }
  return JSON.stringify(value);
}

async function withIsolatedWorkspace(
  run: (ctx: {
    oceanRegistryPath: string;
    manifestUrl: string;
    consultUrl: string;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ocean-consult-"));
  const oceanRegistryPath = path.join(root, ".mirror", "ocean_registry.json");
  const manifestUrl = "https://pond-a.example/pond/manifest";
  const consultUrl = "https://pond-a.example/pond/consult";

  try {
    process.chdir(root);
    delete process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM;
    delete process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM;
    delete process.env.MIRROR_POND_ID;
    await run({ oceanRegistryPath, manifestUrl, consultUrl });
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
  __resetOceanConsultCacheForTests();
  delete process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM;
  delete process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM;
  delete process.env.MIRROR_POND_ID;
});

describe("consultOceanPond", () => {
  it("denies blocked pond consult with 403", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath, manifestUrl }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "blocked", manifest_url: manifestUrl }],
        })}\n`,
        "utf-8",
      );

      let fetchCalls = 0;
      await expect(
        consultOceanPond({
          pondId: "pond-a",
          requestPayload: { q: "hello" },
          registryPath: oceanRegistryPath,
          fetchFn: async () => {
            fetchCalls += 1;
            return createJsonResponse({});
          },
        }),
      ).rejects.toThrow(/denied/);
      expect(fetchCalls).toBe(0);
    });
  });

  it("allows known pond consult", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath, manifestUrl, consultUrl }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "known", manifest_url: manifestUrl }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest({ consultUrl });

      const result = await consultOceanPond({
        pondId: "pond-a",
        requestPayload: { q: "hello" },
        registryPath: oceanRegistryPath,
        fetchFn: async (url) => {
          const textUrl = toFetchUrlText(url);
          if (textUrl === manifestUrl) {
            return createJsonResponse(manifest);
          }
          if (textUrl === consultUrl) {
            return createJsonResponse({ answer: "ok-known" });
          }
          return new Response("not found", { status: 404 });
        },
      });

      expect(result.source_pond).toBe("pond-a");
      expect(result.source_url).toBe(consultUrl);
      expect(result.signature_ok).toBe(true);
      expect(result.payload).toEqual({ answer: "ok-known" });

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as {
        ponds: Array<Record<string, unknown>>;
      };
      expect(typeof persisted.ponds[0]?.last_consult_at).toBe("string");
      expect(persisted.ponds[0]?.last_consult_ok).toBe(true);
      expect(persisted.ponds[0]?.trust_status).toBe("known");
      expect(persisted.ponds[0]?.last_error).toBeUndefined();
    });
  });

  it("allows trusted pond consult", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath, manifestUrl, consultUrl }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "trusted", manifest_url: manifestUrl }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest({ consultUrl });

      const result = await consultOceanPond({
        pondId: "pond-a",
        requestPayload: { q: "hello" },
        registryPath: oceanRegistryPath,
        fetchFn: async (url) => {
          const textUrl = toFetchUrlText(url);
          if (textUrl === manifestUrl) {
            return createJsonResponse(manifest);
          }
          if (textUrl === consultUrl) {
            return createJsonResponse({ answer: "ok-trusted" });
          }
          return new Response("not found", { status: 404 });
        },
      });

      expect(result.payload).toEqual({ answer: "ok-trusted" });

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as {
        ponds: Array<Record<string, unknown>>;
      };
      expect(persisted.ponds[0]?.trust_status).toBe("trusted");
    });
  });

  it("rejects invalid signature", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath, manifestUrl, consultUrl }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "known", manifest_url: manifestUrl }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest({ consultUrl });
      manifest.signature = `${manifest.signature.slice(0, -2)}aa`;

      await expect(
        consultOceanPond({
          pondId: "pond-a",
          requestPayload: { q: "hello" },
          registryPath: oceanRegistryPath,
          fetchFn: async (url) => {
            const textUrl = toFetchUrlText(url);
            if (textUrl === manifestUrl) {
              return createJsonResponse(manifest);
            }
            if (textUrl === consultUrl) {
              return createJsonResponse({ answer: "should-not-run" });
            }
            return new Response("not found", { status: 404 });
          },
        }),
      ).rejects.toThrow(/signature verification failed/);
    });
  });

  it("handles missing consult capability", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath, manifestUrl, consultUrl }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "known", manifest_url: manifestUrl }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest({
        consultUrl,
        capabilities: ["pond-manifest", "pond-refresh"],
      });

      await expect(
        consultOceanPond({
          pondId: "pond-a",
          requestPayload: { q: "hello" },
          registryPath: oceanRegistryPath,
          fetchFn: async (url) => {
            const textUrl = toFetchUrlText(url);
            if (textUrl === manifestUrl) {
              return createJsonResponse(manifest);
            }
            if (textUrl === consultUrl) {
              return createJsonResponse({ answer: "should-not-run" });
            }
            return new Response("not found", { status: 404 });
          },
        }),
      ).rejects.toThrow(/missing consult\.read capability/);

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as {
        ponds: Array<Record<string, unknown>>;
      };
      expect(typeof persisted.ponds[0]?.last_consult_at).toBe("string");
      expect(persisted.ponds[0]?.last_consult_ok).toBe(false);
      expect(stringifyLastError(persisted.ponds[0]?.last_error)).toContain(
        "missing consult.read capability",
      );
    });
  });

  it("updates last_error when consult call fails", async () => {
    await withIsolatedWorkspace(async ({ oceanRegistryPath, manifestUrl, consultUrl }) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [{ pond_id: "pond-a", trust_status: "known", manifest_url: manifestUrl }],
        })}\n`,
        "utf-8",
      );

      const keys = generatePemPair();
      process.env.MIRROR_POND_SIGNING_PRIVATE_KEY_PEM = keys.privateKeyPem;
      process.env.MIRROR_POND_SIGNING_PUBLIC_KEY_PEM = keys.publicKeyPem;
      process.env.MIRROR_POND_ID = "pond-a";
      const manifest = await buildSignedPondManifest({ consultUrl });

      await expect(
        consultOceanPond({
          pondId: "pond-a",
          requestPayload: { q: "hello" },
          registryPath: oceanRegistryPath,
          fetchFn: async (url) => {
            const textUrl = toFetchUrlText(url);
            if (textUrl === manifestUrl) {
              return createJsonResponse(manifest);
            }
            if (textUrl === consultUrl) {
              return new Response("upstream failed", { status: 502 });
            }
            return new Response("not found", { status: 404 });
          },
        }),
      ).rejects.toThrow(/consult call failed: 502/);

      const persisted = JSON.parse(await fs.readFile(oceanRegistryPath, "utf-8")) as {
        ponds: Array<Record<string, unknown>>;
      };
      expect(persisted.ponds[0]?.last_consult_ok).toBe(false);
      expect(stringifyLastError(persisted.ponds[0]?.last_error)).toContain(
        "consult call failed: 502",
      );
      expect(persisted.ponds[0]?.trust_status).toBe("known");
    });
  });
});
