/**
 * Runtime Server Integration
 *
 * Implements runtime + Pond/Ocean endpoints.
 */

import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import type { Request } from "express";
import type { RuntimeEnv } from "../runtime.js";
import { handleHealthEndpoint } from "./health.js";
import { isOceanActionAllowed } from "./ocean-trust-policy.js";

type PondTrustStatus = "known" | "trusted" | "blocked";

type PondManifestBase = {
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

type SignedPondManifest = PondManifestBase & {
  manifest_version: string;
  signed_at: string;
  pubkey_id: string;
  public_key: string;
  signature: string;
  consult_url?: string;
};

type OceanPondEntry = {
  pond_id: string;
  trust_status?: PondTrustStatus;
  pubkey_id?: string;
  signature_ok?: boolean;
  last_handshake_at?: string;
  last_consult_at?: string;
  last_consult_ok?: boolean;
  last_signature_ok?: boolean;
  remote_runtime?: string;
  remote_ocean_protocol?: string;
  last_error?: string;
  [key: string]: unknown;
};

type OceanRegistry = {
  ponds: OceanPondEntry[];
};

type OceanConsultResponse = {
  source_pond: string;
  source_url: string;
  fetched_at: string;
  signature_ok: boolean;
  payload: unknown;
};

type OceanStatusSummary = {
  local_pond_id: string;
  known_ponds_count: number;
  trusted_ponds_count: number;
  blocked_ponds_count: number;
  handshakes: {
    successful_count: number;
    last_success_at: string | null;
  };
  consults: {
    successful_count: number;
    last_success_at: string | null;
  };
};

export type RuntimeSessionStore = {
  resolvePath: (...segments: string[]) => string;
};

export type RuntimeServerServiceOverrides = {
  buildSignedPondManifest?: typeof buildSignedPondManifest;
  refreshPondRegistry?: typeof refreshPondRegistry;
  readOceanRegistry?: typeof readOceanRegistry;
  fetchAndUpsertOceanPondManifest?: typeof fetchAndUpsertOceanPondManifest;
  consultOceanPond?: typeof consultOceanPond;
  updateOceanPondTrust?: typeof updateOceanPondTrust;
  getOceanStatus?: typeof getOceanStatus;
};

export type RuntimeServerOptions = {
  requireRuntimeEnabledEnv?: boolean;
  sessionStore?: RuntimeSessionStore;
  services?: RuntimeServerServiceOverrides;
};

type PondRegistry = {
  count: number;
  ponds: SignedPondManifest[];
};

class PondOceanError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const OCEAN_TRUST_STATUSES: readonly PondTrustStatus[] = ["known", "trusted", "blocked"];
const DEFAULT_MANIFEST_VERSION = "pond-manifest-v1";
const OCEAN_CONSULT_CACHE_TTL_MS = 15_000;
const oceanConsultCache = new Map<string, { expiresAtMs: number; value: OceanConsultResponse }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPondTrustStatus(value: unknown): value is PondTrustStatus {
  return typeof value === "string" && OCEAN_TRUST_STATUSES.includes(value as PondTrustStatus);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).toSorted()) {
      sorted[key] = sortJson(value[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function normalizePem(value: string): string {
  return value.trim().endsWith("\n") ? value.trim() : `${value.trim()}\n`;
}

function computePubkeyId(publicKeyPem: string): string {
  const normalized = normalizePem(publicKeyPem);
  return createHash("sha256").update(normalized).digest("hex");
}

function resolveSignatureAlgorithmForPrivateKey(privateKeyPem: string): "sha256" | null {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType === "ed25519" || key.asymmetricKeyType === "ed448") {
    return null;
  }
  return "sha256";
}

function resolveSignatureAlgorithmForPublicKey(publicKeyPem: string): "sha256" | null {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType === "ed25519" || key.asymmetricKeyType === "ed448") {
    return null;
  }
  return "sha256";
}

function resolveOceanRegistryPath(): string {
  return path.resolve(process.cwd(), ".mirror", "ocean_registry.json");
}

function resolveLocalPondId(): string {
  return process.env.MIRROR_POND_ID?.trim() || "toadaid-main";
}

function resolvePondRegistryPath(): string {
  return path.resolve(process.cwd(), ".mirror", "pond_registry.json");
}

function resolveMirrorDaemonToken(): string | null {
  const token = process.env.MIRROR_DAEMON_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function extractAuthTokenFromRequest(req: Request): string | null {
  const authHeader = req.header("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  const mirrorHeader = req.header("x-mirror-token");
  if (mirrorHeader && mirrorHeader.trim().length > 0) {
    return mirrorHeader.trim();
  }
  return null;
}

async function readPemFromEnvOrPath(params: {
  valueEnv: string;
  pathEnv: string;
}): Promise<string | null> {
  const inline = process.env[params.valueEnv]?.trim();
  if (inline) {
    return normalizePem(inline);
  }
  const filePath = process.env[params.pathEnv]?.trim();
  if (!filePath) {
    return null;
  }
  const raw = await fs.readFile(path.resolve(filePath), "utf-8");
  return normalizePem(raw);
}

async function resolvePondSigningMaterial(): Promise<{
  privateKeyPem: string;
  publicKeyPem: string;
  pubkeyId: string;
}> {
  const privateKeyPem = await readPemFromEnvOrPath({
    valueEnv: "MIRROR_POND_SIGNING_PRIVATE_KEY_PEM",
    pathEnv: "MIRROR_POND_SIGNING_PRIVATE_KEY_PATH",
  });
  if (!privateKeyPem) {
    throw new PondOceanError(
      500,
      "pond signing key missing: set MIRROR_POND_SIGNING_PRIVATE_KEY_PEM or MIRROR_POND_SIGNING_PRIVATE_KEY_PATH",
    );
  }

  const configuredPublicKeyPem = await readPemFromEnvOrPath({
    valueEnv: "MIRROR_POND_SIGNING_PUBLIC_KEY_PEM",
    pathEnv: "MIRROR_POND_SIGNING_PUBLIC_KEY_PATH",
  });
  const publicKeyPem =
    configuredPublicKeyPem ??
    createPublicKey(privateKeyPem).export({ format: "pem", type: "spki" });
  const normalizedPublicKeyPem = normalizePem(publicKeyPem);
  return {
    privateKeyPem: normalizePem(privateKeyPem),
    publicKeyPem: normalizedPublicKeyPem,
    pubkeyId: computePubkeyId(normalizedPublicKeyPem),
  };
}

function buildUnsignedPondManifest(): PondManifestBase {
  const pondId = process.env.MIRROR_POND_ID?.trim() || "toadaid-main";
  const pondName = process.env.MIRROR_POND_NAME?.trim() || "ToadAid Main";
  const runtimeName = process.env.MIRROR_RUNTIME_NAME || "openclaw-runtime";
  const runtimeVersion = process.env.MIRROR_RUNTIME_VERSION || "unknown";
  const agents = process.env.MIRROR_POND_AGENTS
    ? process.env.MIRROR_POND_AGENTS.split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : ["main"];

  return {
    pond_id: pondId,
    name: pondName,
    runtime: runtimeName,
    runtime_version: runtimeVersion,
    ocean_protocol: "ocean-v0",
    federation_enabled: false,
    public: true,
    capabilities: [
      "pond-manifest",
      "pond-refresh",
      "ocean-registry",
      "ocean-trust-management",
      "consult.read",
    ],
    agents,
  };
}

function buildManifestSignablePayload(manifest: Omit<SignedPondManifest, "signature">) {
  return {
    manifest_version: manifest.manifest_version,
    signed_at: manifest.signed_at,
    pond_id: manifest.pond_id,
    name: manifest.name,
    runtime: manifest.runtime,
    runtime_version: manifest.runtime_version,
    ocean_protocol: manifest.ocean_protocol,
    federation_enabled: manifest.federation_enabled,
    public: manifest.public,
    capabilities: manifest.capabilities,
    agents: manifest.agents,
    pubkey_id: manifest.pubkey_id,
    public_key: manifest.public_key,
    consult_url: manifest.consult_url,
  };
}

export async function buildSignedPondManifest(params?: {
  nowIso?: string;
  manifestVersion?: string;
  capabilities?: string[];
  consultUrl?: string;
}): Promise<SignedPondManifest> {
  const signing = await resolvePondSigningMaterial();
  const unsigned = buildUnsignedPondManifest();
  const signable: Omit<SignedPondManifest, "signature"> = {
    ...unsigned,
    capabilities: params?.capabilities ?? unsigned.capabilities,
    manifest_version: params?.manifestVersion ?? DEFAULT_MANIFEST_VERSION,
    signed_at: params?.nowIso ?? new Date().toISOString(),
    pubkey_id: signing.pubkeyId,
    public_key: signing.publicKeyPem,
    consult_url: params?.consultUrl ?? process.env.MIRROR_POND_CONSULT_URL?.trim() ?? undefined,
  };
  const payload = Buffer.from(canonicalJson(buildManifestSignablePayload(signable)), "utf-8");
  const algorithm = resolveSignatureAlgorithmForPrivateKey(signing.privateKeyPem);
  const signature = sign(algorithm, payload, signing.privateKeyPem).toString("base64");
  return {
    ...signable,
    signature,
  };
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function readOceanRegistry(registryPath: string): Promise<OceanRegistry> {
  try {
    const raw = await fs.readFile(registryPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.ponds)) {
      throw new PondOceanError(500, "Invalid ocean registry format: expected { ponds: [] }");
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

async function refreshPondRegistry(params?: {
  registryPath?: string;
}): Promise<{ path: string; manifest: SignedPondManifest }> {
  const manifest = await buildSignedPondManifest();
  const registryPath = params?.registryPath ?? resolvePondRegistryPath();
  const payload: PondRegistry = {
    count: 1,
    ponds: [manifest],
  };
  await writeJsonFile(registryPath, payload);
  return { path: registryPath, manifest };
}

function assertSignedManifest(value: unknown): SignedPondManifest {
  if (!isRecord(value)) {
    throw new PondOceanError(400, "manifest payload must be a JSON object");
  }

  const requiredStringFields = [
    "pond_id",
    "name",
    "runtime",
    "runtime_version",
    "ocean_protocol",
    "manifest_version",
    "signed_at",
    "pubkey_id",
    "public_key",
    "signature",
  ] as const;
  for (const field of requiredStringFields) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
      throw new PondOceanError(400, `manifest missing required field: ${field}`);
    }
  }
  if (typeof value.federation_enabled !== "boolean") {
    throw new PondOceanError(400, "manifest missing required field: federation_enabled");
  }
  if (typeof value.public !== "boolean") {
    throw new PondOceanError(400, "manifest missing required field: public");
  }
  if (
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every((entry) => typeof entry === "string")
  ) {
    throw new PondOceanError(400, "manifest missing required field: capabilities string[]");
  }
  if (!Array.isArray(value.agents) || !value.agents.every((entry) => typeof entry === "string")) {
    throw new PondOceanError(400, "manifest missing required field: agents string[]");
  }
  if (value.consult_url !== undefined && typeof value.consult_url !== "string") {
    throw new PondOceanError(400, "manifest field consult_url must be a string when provided");
  }
  return value as SignedPondManifest;
}

function verifySignedManifest(manifest: SignedPondManifest): { pubkeyId: string } {
  const derivedPubkeyId = computePubkeyId(manifest.public_key);
  if (derivedPubkeyId !== manifest.pubkey_id) {
    throw new PondOceanError(400, "manifest pubkey_id does not match manifest public_key");
  }

  const signable = { ...manifest };
  delete (signable as Partial<SignedPondManifest>).signature;

  const signature = Buffer.from(manifest.signature, "base64");
  if (signature.length === 0) {
    throw new PondOceanError(400, "manifest signature is not valid base64");
  }

  const payload = Buffer.from(canonicalJson(buildManifestSignablePayload(signable)), "utf-8");
  const algorithm = resolveSignatureAlgorithmForPublicKey(manifest.public_key);
  const ok = verify(algorithm, payload, normalizePem(manifest.public_key), signature);
  if (!ok) {
    throw new PondOceanError(400, "manifest signature verification failed");
  }

  return { pubkeyId: derivedPubkeyId };
}

function mergeManualPondEntry(
  existing: OceanPondEntry | undefined,
  body: Record<string, unknown>,
): OceanPondEntry {
  const pondId = body.pond_id;
  if (typeof pondId !== "string" || pondId.trim().length === 0) {
    throw new PondOceanError(400, "pond_id must be a non-empty string");
  }

  const trustStatus = body.trust_status;
  if (trustStatus !== undefined && !isPondTrustStatus(trustStatus)) {
    throw new PondOceanError(
      400,
      `trust_status must be one of: ${OCEAN_TRUST_STATUSES.join(", ")}`,
    );
  }

  return {
    ...existing,
    ...body,
    pond_id: pondId,
    trust_status:
      (isPondTrustStatus(trustStatus) ? trustStatus : existing?.trust_status) ?? "known",
  };
}

async function upsertOceanPondEntry(params: {
  entry: OceanPondEntry;
  registryPath?: string;
}): Promise<OceanPondEntry> {
  const registryPath = params.registryPath ?? resolveOceanRegistryPath();
  const registry = await readOceanRegistry(registryPath);
  const index = registry.ponds.findIndex((item) => item.pond_id === params.entry.pond_id);
  if (index >= 0) {
    registry.ponds[index] = params.entry;
  } else {
    registry.ponds.push(params.entry);
  }
  await writeOceanRegistry(registryPath, registry);
  return params.entry;
}

async function patchOceanPondEntry(params: {
  pondId: string;
  registryPath: string;
  patch: Partial<OceanPondEntry>;
}): Promise<OceanPondEntry | null> {
  const registry = await readOceanRegistry(params.registryPath);
  const index = registry.ponds.findIndex((item) => item.pond_id === params.pondId);
  if (index < 0) {
    return null;
  }
  const current = registry.ponds[index] ?? { pond_id: params.pondId };
  const next: OceanPondEntry = {
    ...current,
    ...params.patch,
  };
  if (params.patch.last_error === undefined) {
    delete next.last_error;
  }
  registry.ponds[index] = next;
  await writeOceanRegistry(params.registryPath, registry);
  return next;
}

function resolvePinnedPubkeyId(existing: OceanPondEntry | undefined): string | null {
  const pinned = existing?.pubkey_id;
  if (typeof pinned !== "string" || pinned.trim().length === 0) {
    return null;
  }
  return pinned;
}

function pruneOceanConsultCache(nowMs: number): void {
  for (const [key, entry] of oceanConsultCache.entries()) {
    if (entry.expiresAtMs <= nowMs) {
      oceanConsultCache.delete(key);
    }
  }
}

export function __resetOceanConsultCacheForTests(): void {
  oceanConsultCache.clear();
}

function resolveConsultCacheKey(pondId: string, requestPayload: unknown): string {
  return canonicalJson({
    pondId,
    request: requestPayload,
  });
}

function extractCapabilities(entry: OceanPondEntry): string[] {
  const capabilities = entry.capabilities;
  if (!Array.isArray(capabilities)) {
    return [];
  }
  return capabilities.filter((item): item is string => typeof item === "string");
}

function resolveConsultUrl(entry: OceanPondEntry): string {
  const consultUrl = entry.consult_url;
  if (typeof consultUrl === "string" && consultUrl.trim().length > 0) {
    return consultUrl;
  }
  const manifestUrl = entry.manifest_url;
  if (typeof manifestUrl !== "string" || manifestUrl.trim().length === 0) {
    throw new PondOceanError(
      400,
      `pond ${entry.pond_id} missing manifest_url for consult resolution`,
    );
  }
  const resolved = new URL(manifestUrl);
  return `${resolved.origin}/pond/consult`;
}

export async function fetchAndUpsertOceanPondManifest(params: {
  manifestUrl: string;
  registryPath?: string;
  fetchFn?: typeof fetch;
  nowMs?: number;
}): Promise<OceanPondEntry> {
  if (typeof params.manifestUrl !== "string" || params.manifestUrl.trim().length === 0) {
    throw new PondOceanError(400, "manifest_url must be a non-empty string");
  }

  const fetchFn = params.fetchFn ?? fetch;
  const response = await fetchFn(params.manifestUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new PondOceanError(400, `manifest fetch failed: ${response.status}`);
  }

  const manifest = assertSignedManifest((await response.json()) as unknown);
  verifySignedManifest(manifest);

  const registryPath = params.registryPath ?? resolveOceanRegistryPath();
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
  const registry = await readOceanRegistry(registryPath);
  const existing = registry.ponds.find((entry) => entry.pond_id === manifest.pond_id);
  const fetchDecision = isOceanActionAllowed({
    trust_status: existing?.trust_status,
    action: "manifest.fetch",
  });
  if (!fetchDecision.allowed) {
    throw new PondOceanError(403, fetchDecision.reason);
  }
  const pinnedPubkeyId = resolvePinnedPubkeyId(existing);
  if (pinnedPubkeyId && pinnedPubkeyId !== manifest.pubkey_id) {
    throw new PondOceanError(
      400,
      `pubkey_id changed for pond ${manifest.pond_id}; explicit rotation override is required`,
    );
  }

  const nextEntry: OceanPondEntry = {
    ...existing,
    ...manifest,
    manifest_url: params.manifestUrl,
    trust_status: existing?.trust_status ?? "known",
    pubkey_id: manifest.pubkey_id,
    signature_ok: true,
    last_signature_ok: true,
    last_handshake_at: nowIso,
    remote_runtime: manifest.runtime,
    remote_ocean_protocol: manifest.ocean_protocol,
  };
  delete nextEntry.last_error;

  const index = registry.ponds.findIndex((entry) => entry.pond_id === manifest.pond_id);
  if (index >= 0) {
    registry.ponds[index] = nextEntry;
  } else {
    registry.ponds.push(nextEntry);
  }
  await writeOceanRegistry(registryPath, registry);

  return nextEntry;
}

export async function consultOceanPond(params: {
  pondId: string;
  requestPayload: unknown;
  registryPath?: string;
  fetchFn?: typeof fetch;
  nowMs?: number;
  cacheTtlMs?: number;
}): Promise<OceanConsultResponse> {
  if (typeof params.pondId !== "string" || params.pondId.trim().length === 0) {
    throw new PondOceanError(400, "pond_id must be a non-empty string");
  }

  const nowMs = params.nowMs ?? Date.now();
  pruneOceanConsultCache(nowMs);
  const cacheKey = resolveConsultCacheKey(params.pondId, params.requestPayload);
  const cached = oceanConsultCache.get(cacheKey);
  if (cached && cached.expiresAtMs > nowMs) {
    return cached.value;
  }

  const registryPath = params.registryPath ?? resolveOceanRegistryPath();
  const registry = await readOceanRegistry(registryPath);
  const pond = registry.ponds.find((entry) => entry.pond_id === params.pondId);
  if (!pond) {
    throw new PondOceanError(404, `unknown pond_id: ${params.pondId}`);
  }
  const attemptAtIso = new Date(nowMs).toISOString();

  try {
    const consultDecision = isOceanActionAllowed({
      trust_status: pond.trust_status,
      action: "consult.read",
    });
    if (!consultDecision.allowed) {
      throw new PondOceanError(403, consultDecision.reason);
    }

    const manifestUrl = pond.manifest_url;
    if (typeof manifestUrl !== "string" || manifestUrl.trim().length === 0) {
      throw new PondOceanError(400, `pond ${params.pondId} missing manifest_url`);
    }

    const verified = await fetchAndUpsertOceanPondManifest({
      manifestUrl,
      registryPath,
      fetchFn: params.fetchFn,
      nowMs,
    });
    if (verified.pond_id !== params.pondId) {
      throw new PondOceanError(400, `manifest pond_id mismatch: expected ${params.pondId}`);
    }

    const capabilities = extractCapabilities(verified);
    if (!capabilities.includes("consult.read")) {
      throw new PondOceanError(400, `pond ${params.pondId} missing consult.read capability`);
    }

    const consultUrl = resolveConsultUrl(verified);
    const fetchFn = params.fetchFn ?? fetch;
    const consultResponse = await fetchFn(consultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        request: params.requestPayload ?? null,
      }),
    });
    if (!consultResponse.ok) {
      throw new PondOceanError(400, `consult call failed: ${consultResponse.status}`);
    }

    let payload: unknown;
    try {
      payload = await consultResponse.json();
    } catch {
      payload = { ok: true };
    }

    const result: OceanConsultResponse = {
      source_pond: verified.pond_id,
      source_url: consultUrl,
      fetched_at: attemptAtIso,
      signature_ok: verified.signature_ok === true,
      payload,
    };

    await patchOceanPondEntry({
      pondId: params.pondId,
      registryPath,
      patch: {
        last_consult_at: attemptAtIso,
        last_consult_ok: true,
        last_error: undefined,
      },
    });

    oceanConsultCache.set(cacheKey, {
      expiresAtMs: nowMs + (params.cacheTtlMs ?? OCEAN_CONSULT_CACHE_TTL_MS),
      value: result,
    });
    return result;
  } catch (error) {
    await patchOceanPondEntry({
      pondId: params.pondId,
      registryPath,
      patch: {
        last_consult_at: attemptAtIso,
        last_consult_ok: false,
        last_error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function updateOceanPondTrust(params: {
  pondId: unknown;
  trustStatus: unknown;
  registryPath?: string;
}): Promise<OceanPondEntry> {
  if (typeof params.pondId !== "string" || params.pondId.trim().length === 0) {
    throw new PondOceanError(400, "pond_id must be a non-empty string");
  }
  if (!isPondTrustStatus(params.trustStatus)) {
    throw new PondOceanError(
      400,
      `trust_status must be one of: ${OCEAN_TRUST_STATUSES.join(", ")}`,
    );
  }

  const registryPath = params.registryPath ?? resolveOceanRegistryPath();
  const registry = await readOceanRegistry(registryPath);
  const pond = registry.ponds.find((entry) => entry.pond_id === params.pondId);
  if (!pond) {
    throw new PondOceanError(404, `unknown pond_id: ${params.pondId}`);
  }

  pond.trust_status = params.trustStatus;
  await writeOceanRegistry(registryPath, registry);
  return pond;
}

export async function getOceanStatus(params?: {
  registryPath?: string;
}): Promise<OceanStatusSummary> {
  const registryPath = params?.registryPath ?? resolveOceanRegistryPath();
  const registry = await readOceanRegistry(registryPath);
  const knownPondsCount = registry.ponds.length;
  const trustedPondsCount = registry.ponds.filter(
    (entry) => entry.trust_status === "trusted",
  ).length;
  const blockedPondsCount = registry.ponds.filter(
    (entry) => entry.trust_status === "blocked",
  ).length;

  const successfulHandshakeTimes = registry.ponds
    .map((entry) => entry.last_handshake_at)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const successfulConsultTimes = registry.ponds
    .filter((entry) => entry.last_consult_ok === true)
    .map((entry) => entry.last_consult_at)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return {
    local_pond_id: resolveLocalPondId(),
    known_ponds_count: knownPondsCount,
    trusted_ponds_count: trustedPondsCount,
    blocked_ponds_count: blockedPondsCount,
    handshakes: {
      successful_count: successfulHandshakeTimes.length,
      last_success_at:
        successfulHandshakeTimes.length > 0
          ? (successfulHandshakeTimes.toSorted().at(-1) ?? null)
          : null,
    },
    consults: {
      successful_count: successfulConsultTimes.length,
      last_success_at:
        successfulConsultTimes.length > 0
          ? (successfulConsultTimes.toSorted().at(-1) ?? null)
          : null,
    },
  };
}

export async function startRuntimeServer(
  env: RuntimeEnv,
  brainUrl: string | undefined,
  authToken: string | undefined,
  options?: RuntimeServerOptions,
): Promise<express.Application> {
  if (options?.requireRuntimeEnabledEnv !== false && process.env.MIRROR_ENABLE_RUNTIME !== "true") {
    throw new Error("MIRROR_ENABLE_RUNTIME is not true");
  }

  const serviceDeps = {
    buildSignedPondManifest,
    refreshPondRegistry,
    readOceanRegistry,
    fetchAndUpsertOceanPondManifest,
    consultOceanPond,
    updateOceanPondTrust,
    getOceanStatus,
    ...options?.services,
  };
  const pondRegistryPath =
    options?.sessionStore?.resolvePath("pond_registry.json") ?? resolvePondRegistryPath();
  const oceanRegistryPath =
    options?.sessionStore?.resolvePath("ocean_registry.json") ?? resolveOceanRegistryPath();

  const app = express();
  app.use(express.json());

  const daemonToken = resolveMirrorDaemonToken();
  const publicRoutes = new Set(["/health", "/pond/manifest"]);
  app.use((req, res, next) => {
    if (!daemonToken) {
      return next();
    }
    if (publicRoutes.has(req.path)) {
      return next();
    }
    const token = extractAuthTokenFromRequest(req);
    if (token !== daemonToken) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return next();
  });

  app.get("/health", async (req, res) => {
    try {
      const health = await handleHealthEndpoint(env, brainUrl, authToken);
      return res.json(health);
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

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
      return res.json(chatRes);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.get("/pond/manifest", async (req, res) => {
    try {
      const manifest = await serviceDeps.buildSignedPondManifest();
      return res.status(200).json(manifest);
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post("/pond/consult", async (req, res) => {
    try {
      const body = req.body as unknown;
      const requestPayload = isRecord(body) ? (body.request ?? null) : null;
      return res.status(200).json({
        pond_id: process.env.MIRROR_POND_ID?.trim() || "toadaid-main",
        mode: "consult.read",
        response: {
          ok: true,
          request: requestPayload,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post("/pond/refresh", async (req, res) => {
    try {
      const refreshed = await serviceDeps.refreshPondRegistry({
        registryPath: pondRegistryPath,
      });
      return res.status(200).json({ ok: true, path: refreshed.path, pond: refreshed.manifest });
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  app.get("/ocean/ponds", async (req, res) => {
    try {
      const registry = await serviceDeps.readOceanRegistry(oceanRegistryPath);
      return res.status(200).json({ count: registry.ponds.length, ponds: registry.ponds });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.get("/ocean/status", async (req, res) => {
    try {
      const summary = await serviceDeps.getOceanStatus({ registryPath: oceanRegistryPath });
      return res.status(200).json(summary);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post("/ocean/ponds", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        throw new PondOceanError(400, "request body must be a JSON object");
      }
      const registryPath = oceanRegistryPath;
      const registry = await serviceDeps.readOceanRegistry(registryPath);
      const existing = registry.ponds.find((entry) => entry.pond_id === body.pond_id);
      const entry = mergeManualPondEntry(existing, body);
      const upserted = await upsertOceanPondEntry({ entry, registryPath });
      return res.status(200).json({ success: true, pond: upserted });
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post("/ocean/ponds/fetch", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        throw new PondOceanError(400, "request body must be a JSON object");
      }
      const manifestUrl = body.manifest_url;
      if (typeof manifestUrl !== "string" || manifestUrl.trim().length === 0) {
        throw new PondOceanError(400, "manifest_url must be a non-empty string");
      }
      const pond = await serviceDeps.fetchAndUpsertOceanPondManifest({
        manifestUrl,
        registryPath: oceanRegistryPath,
      });
      return res.status(200).json({ success: true, pond });
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post("/ocean/consult", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        throw new PondOceanError(400, "request body must be a JSON object");
      }
      const pondId = body.pond_id;
      if (typeof pondId !== "string" || pondId.trim().length === 0) {
        throw new PondOceanError(400, "pond_id must be a non-empty string");
      }
      const result = await serviceDeps.consultOceanPond({
        pondId,
        requestPayload: body.request ?? null,
        registryPath: oceanRegistryPath,
      });
      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post("/ocean/ponds/trust", async (req, res) => {
    try {
      const body = req.body as unknown;
      if (!isRecord(body)) {
        throw new PondOceanError(400, "request body must be a JSON object");
      }
      const pond = await serviceDeps.updateOceanPondTrust({
        pondId: body.pond_id,
        trustStatus: body.trust_status,
        registryPath: oceanRegistryPath,
      });
      return res.status(200).json(pond);
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  return app;
}
