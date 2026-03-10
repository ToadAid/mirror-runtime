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

async function readOceanRegistry(registryPath: string): Promise<OceanRegistry> {
  const raw = await fs.readFile(registryPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.ponds)) {
    throw new Error("Invalid ocean registry format: expected { ponds: [] }");
  }
  return parsed as OceanRegistry;
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
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
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
