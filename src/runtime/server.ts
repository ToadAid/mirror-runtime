/**
 * Runtime Server Integration
 *
 * Implements /health and /api/brain/chat endpoints.
 * Validates environment before starting.
 */

import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import type { RuntimeEnv } from "../runtime.js";
import { handleHealthEndpoint } from "./health.js";

type PondTrustStatus = "known" | "trusted" | "blocked";

type PondManifest = {
  pond_id: string;
  name: string;
  runtime: string;
  runtime_version: string;
  ocean_protocol: string;
  federation_enabled: boolean;
  public: boolean;
  capabilities: string[];
  agents: string[];
};

type OceanPondEntry = {
  pond_id: string;
  trust_status?: string;
  [key: string]: unknown;
};

type OceanRegistry = {
  ponds: OceanPondEntry[];
  [key: string]: unknown;
};

class OceanTrustError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const OCEAN_TRUST_STATUSES: readonly PondTrustStatus[] = ["known", "trusted", "blocked"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPondTrustStatus(value: unknown): value is PondTrustStatus {
  return typeof value === "string" && OCEAN_TRUST_STATUSES.includes(value as PondTrustStatus);
}

function resolveOceanRegistryPath(): string {
  return path.resolve(process.cwd(), ".mirror", "ocean_registry.json");
}

function resolvePondRegistryPath(): string {
  return path.resolve(process.cwd(), ".mirror", "pond_registry.json");
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function readOceanRegistry(registryPath: string): Promise<OceanRegistry> {
  try {
    const raw = await fs.readFile(registryPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.ponds)) {
      throw new Error("Invalid ocean registry format: expected { ponds: [] }");
    }
    return parsed as OceanRegistry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ponds: [] };
    }
    throw error;
  }
}

async function writeOceanRegistry(registryPath: string, registry: OceanRegistry): Promise<void> {
  await writeJsonFile(registryPath, registry);
}

function buildPondManifest(): PondManifest {
  const pondId = process.env.MIRROR_POND_ID?.trim() || "toadaid-main";
  const runtimeVersion = process.env.MIRROR_RUNTIME_VERSION || "unknown";
  const runtimeName = process.env.MIRROR_RUNTIME_NAME || "openclaw-runtime";
  const pondName = process.env.MIRROR_POND_NAME?.trim() || "ToadAid Main";
  const agentList = process.env.MIRROR_POND_AGENTS
    ? process.env.MIRROR_POND_AGENTS.split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    : ["main"];
  return {
    pond_id: pondId,
    name: pondName,
    runtime: runtimeName,
    runtime_version: runtimeVersion,
    ocean_protocol: "ocean-v0",
    federation_enabled: false,
    public: true,
    capabilities: ["pond-manifest", "pond-refresh", "ocean-registry", "ocean-trust-management"],
    agents: agentList,
  };
}

async function refreshPondRegistry(): Promise<{ path: string; manifest: PondManifest }> {
  const registryPath = resolvePondRegistryPath();
  const manifest = buildPondManifest();
  const payload = {
    count: 1,
    ponds: [manifest],
  };
  await writeJsonFile(registryPath, payload);
  return { path: registryPath, manifest };
}

async function upsertOceanPond(params: {
  body: Record<string, unknown>;
  registryPath?: string;
}): Promise<OceanPondEntry> {
  const pondId = params.body.pond_id;
  if (typeof pondId !== "string" || pondId.trim().length === 0) {
    throw new OceanTrustError(400, "pond_id must be a non-empty string");
  }
  const trustStatus = params.body.trust_status;
  if (trustStatus !== undefined && !isPondTrustStatus(trustStatus)) {
    throw new OceanTrustError(
      400,
      `trust_status must be one of: ${OCEAN_TRUST_STATUSES.join(", ")}`,
    );
  }

  const registryPath = params.registryPath ?? resolveOceanRegistryPath();
  const registry = await readOceanRegistry(registryPath);
  const nextEntry: OceanPondEntry = {
    ...params.body,
    pond_id: pondId,
  };
  if (trustStatus === undefined) {
    nextEntry.trust_status = "known";
  }
  const index = registry.ponds.findIndex((entry) => isRecord(entry) && entry.pond_id === pondId);
  if (index >= 0) {
    const current = registry.ponds[index] ?? {};
    registry.ponds[index] = {
      ...current,
      ...nextEntry,
    };
  } else {
    registry.ponds.push(nextEntry);
  }
  await writeOceanRegistry(registryPath, registry);
  const pond = registry.ponds.find(
    (entry): entry is OceanPondEntry => isRecord(entry) && entry.pond_id === pondId,
  );
  if (!pond) {
    throw new OceanTrustError(500, `failed to persist pond: ${pondId}`);
  }
  return pond;
}

export async function updateOceanPondTrust(params: {
  pondId: unknown;
  trustStatus: unknown;
  registryPath?: string;
}): Promise<OceanPondEntry> {
  if (typeof params.pondId !== "string" || params.pondId.trim().length === 0) {
    throw new OceanTrustError(400, "pond_id must be a non-empty string");
  }
  if (!isPondTrustStatus(params.trustStatus)) {
    throw new OceanTrustError(
      400,
      `trust_status must be one of: ${OCEAN_TRUST_STATUSES.join(", ")}`,
    );
  }

  const registryPath = params.registryPath ?? resolveOceanRegistryPath();
  const registry = await readOceanRegistry(registryPath);
  const pond = registry.ponds.find(
    (entry): entry is OceanPondEntry => isRecord(entry) && entry.pond_id === params.pondId,
  );
  if (!pond) {
    throw new OceanTrustError(404, `unknown pond_id: ${params.pondId}`);
  }

  pond.trust_status = params.trustStatus;
  await writeOceanRegistry(registryPath, registry);
  return pond;
}

export async function startRuntimeServer(
  env: RuntimeEnv,
  brainUrl: string | undefined,
  authToken: string | undefined,
): Promise<express.Application> {
  // Validate environment ONLY when runtime is enabled
  if (process.env.MIRROR_ENABLE_RUNTIME !== "true") {
    throw new Error("MIRROR_ENABLE_RUNTIME is not true");
  }

  const app = express();

  // Middleware
  app.use(express.json());

  // /health — Local-only status check. NO network calls.
  app.get("/health", async (req, res) => {
    try {
      const health = await handleHealthEndpoint(env, brainUrl, authToken);
      res.json(health);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // /api/brain/chat — OpenAI-compatible proxy to Brain
  app.post("/api/brain/chat", async (req, res) => {
    try {
      if (!brainUrl) {
        return res.status(400).json({ error: "brainUrl not configured" });
      }
      if (!authToken) {
        return res.status(400).json({ error: "authToken not configured" });
      }

      const chatReq = req.body;
      const { handleBrainChatEndpoint } = await import("./brain-chat.js");
      const chatRes = await handleBrainChatEndpoint(env, brainUrl, authToken, chatReq);
      res.json(chatRes);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // /pond/manifest — Local pond identity + capability metadata.
  app.get("/pond/manifest", async (req, res) => {
    try {
      return res.status(200).json(buildPondManifest());
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // /pond/refresh — Persist canonical local pond registry snapshot.
  app.post("/pond/refresh", async (req, res) => {
    try {
      const refreshed = await refreshPondRegistry();
      return res.status(200).json({ ok: true, path: refreshed.path, pond: refreshed.manifest });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // /ocean/ponds — List known ocean ponds.
  app.get("/ocean/ponds", async (req, res) => {
    try {
      const registry = await readOceanRegistry(resolveOceanRegistryPath());
      return res.status(200).json({
        count: registry.ponds.length,
        ponds: registry.ponds,
      });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // /ocean/ponds — Add/update a known pond entry.
  app.post("/ocean/ponds", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        return res.status(400).json({ error: "request body must be a JSON object" });
      }
      const pond = await upsertOceanPond({ body });
      return res.status(200).json({ success: true, pond });
    } catch (err) {
      if (err instanceof OceanTrustError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  // /ocean/ponds/fetch — Fetch remote manifest and upsert into ocean registry.
  app.post("/ocean/ponds/fetch", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        return res.status(400).json({ error: "request body must be a JSON object" });
      }
      const manifestUrl = body.manifest_url;
      if (typeof manifestUrl !== "string" || manifestUrl.trim().length === 0) {
        return res.status(400).json({ error: "manifest_url must be a non-empty string" });
      }
      const response = await fetch(manifestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        return res.status(400).json({
          error: `manifest fetch failed: ${response.status}`,
        });
      }
      const manifest = (await response.json()) as unknown;
      if (!isRecord(manifest)) {
        return res.status(400).json({ error: "manifest payload must be a JSON object" });
      }
      const pond = await upsertOceanPond({
        body: {
          ...manifest,
          manifest_url: manifestUrl,
          trust_status: manifest.trust_status ?? "known",
        },
      });
      return res.status(200).json({ success: true, pond });
    } catch (err) {
      if (err instanceof OceanTrustError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  // /ocean/ponds/trust — Manual trust management for known ponds.
  app.post("/ocean/ponds/trust", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        return res.status(400).json({ error: "request body must be a JSON object" });
      }

      const pondId = body.pond_id;
      const trustStatus = body.trust_status;
      const pond = await updateOceanPondTrust({
        pondId,
        trustStatus,
      });
      return res.status(200).json(pond);
    } catch (err) {
      if (err instanceof OceanTrustError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `failed to update pond trust: ${message}` });
    }
  });

  return app;
}
