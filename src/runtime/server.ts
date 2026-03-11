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
import { readMirrorJournal, resolveMirrorJournalPath } from "../mirror-daemon/journal.js";
import type { MirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import { createMirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import type { MirrorDaemonReplyRequest } from "../mirror-daemon/reply-backend-adapter.js";
import type { MirrorRuntimeConfigSnapshot } from "../mirror-daemon/runtime-config.js";
import {
  MIRROR_EXECUTE_ENDPOINT,
  type MirrorExecuteResponse,
} from "../mirror-daemon/runtime-http-contract.js";
import type { RuntimeEnv } from "../runtime.js";
import { handleHealthEndpoint } from "./health.js";
import { executeMirrorReplyWithLore, handleMirrorExecuteRequest } from "./mirror-execute.js";
import { type MirrorProviderCredentialsResolver } from "./mirror-provider-bridge.js";
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

type MirrorRunStatus = "completed" | "failed" | "partial" | "pending";

type MirrorRunSummary = {
  run_id: string;
  trace_id: string;
  caller_agent: string | null;
  started_at: string;
  ended_at: string;
  tool_count: number;
  approval_count: number;
  status: MirrorRunStatus;
  last_event_type: string;
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
  readMirrorJournal?: typeof readMirrorJournal;
  resolveProviderCredentials?: MirrorProviderCredentialsResolver;
  resolveMirrorProviderCredentials?: MirrorProviderCredentialsResolver;
  executeMirrorReply?: (request: MirrorDaemonReplyRequest) => Promise<MirrorExecuteResponse>;
};

export type RuntimeServerOptions = {
  requireRuntimeEnabledEnv?: boolean;
  sessionStore?: RuntimeSessionStore;
  services?: RuntimeServerServiceOverrides;
  daemonToken?: string | null;
  journalPath?: string;
  providerEnv?: NodeJS.ProcessEnv;
  providerRuntime?: MirrorDaemonProviderRuntime;
  runtimeConfig?: MirrorRuntimeConfigSnapshot;
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

function resolveLocalPondId(runtimeConfig?: MirrorRuntimeConfigSnapshot): string {
  return runtimeConfig?.pond.id ?? process.env.MIRROR_POND_ID?.trim() ?? "toadaid-main";
}

function resolvePondRegistryPath(): string {
  return path.resolve(process.cwd(), ".mirror", "pond_registry.json");
}

function parsePositiveIntOrDefault(value: unknown, defaultValue: number, maxValue: number): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }
  return Math.min(Math.floor(parsed), maxValue);
}

function deriveMirrorRunStatus(events: Array<{ event_type: string }>): MirrorRunStatus {
  // v0 assumption: a trace is "failed" on explicit failure signals; otherwise a
  // completion signal marks it completed, and request/planning-only traces remain pending.
  if (events.length === 0) {
    return "pending";
  }
  const lastEventType = events[events.length - 1]?.event_type ?? "unknown";
  const hasFailure = events.some(
    (event) =>
      event.event_type === "tool.failed" ||
      event.event_type === "approval.denied" ||
      event.event_type === "approval.token.rejected",
  );
  if (hasFailure) {
    return "failed";
  }

  const hasCompletionSignal = events.some(
    (event) =>
      event.event_type === "tool.executed" ||
      event.event_type === "approval.granted" ||
      event.event_type === "approval.token.accepted",
  );
  if (hasCompletionSignal) {
    if (lastEventType === "policy.decision" || lastEventType === "approval.requested") {
      return "partial";
    }
    return "completed";
  }

  if (lastEventType === "policy.decision" || lastEventType === "approval.requested") {
    return "pending";
  }
  return "partial";
}

function buildMirrorRunSummaries(
  entries: Array<{ ts: string; trace_id: string; [k: string]: unknown }>,
) {
  const grouped = new Map<string, Array<{ ts: string; trace_id: string; [k: string]: unknown }>>();
  for (const entry of entries) {
    const traceId = typeof entry.trace_id === "string" ? entry.trace_id.trim() : "";
    if (!traceId) {
      continue;
    }
    const bucket = grouped.get(traceId) ?? [];
    bucket.push(entry);
    grouped.set(traceId, bucket);
  }

  const summaries: MirrorRunSummary[] = [];
  for (const [traceId, group] of grouped.entries()) {
    const ordered = group.toSorted((a, b) => a.ts.localeCompare(b.ts));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) {
      continue;
    }
    const callerAgentRaw = ordered.find(
      (event) => typeof event.caller_agent === "string",
    )?.caller_agent;
    const callerAgent =
      typeof callerAgentRaw === "string" && callerAgentRaw.trim().length > 0
        ? callerAgentRaw
        : null;
    const toolCount = ordered.filter(
      (event) => event.event_type === "tool.executed" || event.event_type === "tool.failed",
    ).length;
    const approvalCount = ordered.filter(
      (event) => typeof event.event_type === "string" && event.event_type.startsWith("approval."),
    ).length;
    const status = deriveMirrorRunStatus(
      ordered.filter((event) => typeof event.event_type === "string") as Array<{
        event_type: string;
      }>,
    );
    const lastEventType =
      typeof last.event_type === "string" && last.event_type.length > 0
        ? last.event_type
        : "unknown";
    summaries.push({
      run_id: traceId,
      trace_id: traceId,
      caller_agent: callerAgent,
      started_at: first.ts,
      ended_at: last.ts,
      tool_count: toolCount,
      approval_count: approvalCount,
      status,
      last_event_type: lastEventType,
    });
  }

  return summaries.toSorted((a, b) => b.ended_at.localeCompare(a.ended_at));
}

function resolveMirrorDaemonToken(
  explicitToken?: string | null,
  runtimeConfig?: MirrorRuntimeConfigSnapshot,
): string | null {
  const token =
    explicitToken ?? runtimeConfig?.daemon.token ?? process.env.MIRROR_DAEMON_TOKEN?.trim();
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
  runtimeConfigValue?: string;
  runtimeConfigPath?: string;
}): Promise<string | null> {
  const inline = params.runtimeConfigValue?.trim() || process.env[params.valueEnv]?.trim();
  if (inline) {
    return normalizePem(inline);
  }
  const filePath = params.runtimeConfigPath?.trim() || process.env[params.pathEnv]?.trim();
  if (!filePath) {
    return null;
  }
  const raw = await fs.readFile(path.resolve(filePath), "utf-8");
  return normalizePem(raw);
}

async function resolvePondSigningMaterial(runtimeConfig?: MirrorRuntimeConfigSnapshot): Promise<{
  privateKeyPem: string;
  publicKeyPem: string;
  pubkeyId: string;
}> {
  const privateKeyPem = await readPemFromEnvOrPath({
    valueEnv: "MIRROR_POND_SIGNING_PRIVATE_KEY_PEM",
    pathEnv: "MIRROR_POND_SIGNING_PRIVATE_KEY_PATH",
    runtimeConfigValue: runtimeConfig?.pond.signing.privateKeyPem,
    runtimeConfigPath: runtimeConfig?.pond.signing.privateKeyPath,
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
    runtimeConfigValue: runtimeConfig?.pond.signing.publicKeyPem,
    runtimeConfigPath: runtimeConfig?.pond.signing.publicKeyPath,
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

function buildUnsignedPondManifest(runtimeConfig?: MirrorRuntimeConfigSnapshot): PondManifestBase {
  const pondId = runtimeConfig?.pond.id ?? process.env.MIRROR_POND_ID?.trim() ?? "toadaid-main";
  const pondName =
    runtimeConfig?.pond.name ?? process.env.MIRROR_POND_NAME?.trim() ?? "ToadAid Main";
  const runtimeName =
    runtimeConfig?.runtime.name ?? process.env.MIRROR_RUNTIME_NAME ?? "openclaw-runtime";
  const runtimeVersion =
    runtimeConfig?.runtime.version ?? process.env.MIRROR_RUNTIME_VERSION ?? "unknown";
  const agents =
    runtimeConfig?.pond.agents ??
    (process.env.MIRROR_POND_AGENTS
      ? process.env.MIRROR_POND_AGENTS.split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : ["main"]);

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
  runtimeConfig?: MirrorRuntimeConfigSnapshot;
}): Promise<SignedPondManifest> {
  const signing = await resolvePondSigningMaterial(params?.runtimeConfig);
  const unsigned = buildUnsignedPondManifest(params?.runtimeConfig);
  const signable: Omit<SignedPondManifest, "signature"> = {
    ...unsigned,
    capabilities: params?.capabilities ?? unsigned.capabilities,
    manifest_version: params?.manifestVersion ?? DEFAULT_MANIFEST_VERSION,
    signed_at: params?.nowIso ?? new Date().toISOString(),
    pubkey_id: signing.pubkeyId,
    public_key: signing.publicKeyPem,
    consult_url:
      params?.consultUrl ??
      params?.runtimeConfig?.pond.consultUrl ??
      process.env.MIRROR_POND_CONSULT_URL?.trim() ??
      undefined,
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
  runtimeConfig?: MirrorRuntimeConfigSnapshot;
}): Promise<{ path: string; manifest: SignedPondManifest }> {
  const manifest = await buildSignedPondManifest({ runtimeConfig: params?.runtimeConfig });
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
  localPondId?: string;
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
    local_pond_id: params?.localPondId ?? resolveLocalPondId(),
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
  const runtimeConfig = options?.runtimeConfig;
  const runtimeEnabled =
    runtimeConfig?.runtime.enabled ?? process.env.MIRROR_ENABLE_RUNTIME === "true";
  if (options?.requireRuntimeEnabledEnv !== false && !runtimeEnabled) {
    throw new Error("MIRROR_ENABLE_RUNTIME is not true");
  }

  const defaultBuildSignedPondManifest = async (
    params?: Omit<NonNullable<Parameters<typeof buildSignedPondManifest>[0]>, "runtimeConfig">,
  ) => await buildSignedPondManifest({ ...params, runtimeConfig });
  const defaultRefreshPondRegistry = async (
    params?: Omit<NonNullable<Parameters<typeof refreshPondRegistry>[0]>, "runtimeConfig">,
  ) => await refreshPondRegistry({ ...params, runtimeConfig });
  const defaultGetOceanStatus = async (
    params?: Omit<NonNullable<Parameters<typeof getOceanStatus>[0]>, "localPondId">,
  ) => await getOceanStatus({ ...params, localPondId: runtimeConfig?.pond.id });
  const defaultResolveProviderCredentials: MirrorProviderCredentialsResolver = async () => {
    const error = new Error("provider credentials unavailable") as Error & { code?: string };
    error.code = "E_PROVIDER_CREDENTIALS";
    throw error;
  };
  const serviceOverrides = options?.services ?? {};
  const resolveProviderCredentials =
    serviceOverrides.resolveProviderCredentials ??
    serviceOverrides.resolveMirrorProviderCredentials ??
    defaultResolveProviderCredentials;
  const providerEnv =
    options?.providerEnv ??
    (runtimeConfig
      ? {
          ...process.env,
          MIRROR_PROVIDER: runtimeConfig.provider.name,
          MIRROR_PROVIDER_MODEL: runtimeConfig.provider.model,
        }
      : process.env);
  const providerRuntime =
    options?.providerRuntime ??
    createMirrorDaemonProviderRuntime({
      env,
      brainUrl,
      providerEnv,
      authToken,
      resolveProviderCredentials,
    });

  const serviceDeps = {
    buildSignedPondManifest: defaultBuildSignedPondManifest,
    refreshPondRegistry: defaultRefreshPondRegistry,
    readOceanRegistry,
    fetchAndUpsertOceanPondManifest,
    consultOceanPond,
    updateOceanPondTrust,
    getOceanStatus: defaultGetOceanStatus,
    readMirrorJournal,
    executeMirrorReply: async (request: MirrorDaemonReplyRequest): Promise<MirrorExecuteResponse> =>
      await executeMirrorReplyWithLore({
        request,
        providerRuntime,
        loreDir: runtimeConfig?.lore.dir,
      }),
    ...serviceOverrides,
    resolveProviderCredentials: providerRuntime.resolveCredentials,
  };
  const pondRegistryPath =
    options?.sessionStore?.resolvePath("pond_registry.json") ?? resolvePondRegistryPath();
  const oceanRegistryPath =
    options?.sessionStore?.resolvePath("ocean_registry.json") ?? resolveOceanRegistryPath();
  const journalPath =
    options?.journalPath ??
    options?.sessionStore?.resolvePath("run_journal.jsonl") ??
    resolveMirrorJournalPath();

  const app = express();
  app.use(express.json());

  const daemonToken = resolveMirrorDaemonToken(options?.daemonToken, runtimeConfig);
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
      const health = await handleHealthEndpoint(env, brainUrl, authToken, {
        mode: runtimeConfig?.runtime.mode === "intranet" ? "intranet" : "lan",
        version: runtimeConfig?.runtime.version ?? process.env.MIRROR_RUNTIME_VERSION ?? "unknown",
        commit: runtimeConfig?.runtime.commit ?? process.env.MIRROR_RUNTIME_COMMIT ?? "unknown",
      });
      return res.json(health);
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post("/api/brain/chat", async (req, res) => {
    try {
      const chatReq = req.body;
      const result = await providerRuntime.executeBrainChat({
        request: chatReq,
      });
      if (!result.ok) {
        if (
          result.error.code === "E_BRAIN_URL_NOT_CONFIGURED" ||
          result.error.code === "E_BRAIN_AUTH_TOKEN_NOT_CONFIGURED"
        ) {
          return res.status(400).json({ error: result.error.message });
        }
        return res.status(500).json({ error: `[${result.error.code}] ${result.error.message}` });
      }
      return res.json(result.response);
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
        pond_id: resolveLocalPondId(runtimeConfig),
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

  app.get("/mirror/journal", async (req, res) => {
    try {
      const limit = parsePositiveIntOrDefault(req.query.limit, 20, 200);
      const eventType =
        typeof req.query.type === "string" && req.query.type.trim().length > 0
          ? req.query.type.trim()
          : null;
      const traceId =
        typeof req.query.trace_id === "string" && req.query.trace_id.trim().length > 0
          ? req.query.trace_id.trim()
          : null;

      const entries = await serviceDeps.readMirrorJournal({ path: journalPath });
      const filtered = entries.filter((entry) => {
        if (eventType && entry.event_type !== eventType) {
          return false;
        }
        if (traceId && entry.trace_id !== traceId) {
          return false;
        }
        return true;
      });
      const newest = filtered.slice(Math.max(0, filtered.length - limit)).toReversed();

      return res.status(200).json({
        count: newest.length,
        order: "newest-first",
        entries: newest,
      });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.get("/mirror/provider/status", async (req, res) => {
    try {
      const status = await providerRuntime.getProviderStatus({
        runtimeSnapshot: runtimeConfig !== undefined,
      });
      return res.status(200).json(status);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.get("/mirror/provider/health", async (req, res) => {
    try {
      const probe = await providerRuntime.probeProviderHealth({
        runtimeSnapshot: runtimeConfig !== undefined,
      });
      return res.status(200).json(probe);
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  app.post(MIRROR_EXECUTE_ENDPOINT, async (req, res) => {
    const result = await handleMirrorExecuteRequest({
      body: req.body,
      executeMirrorReply: serviceDeps.executeMirrorReply,
    });
    return res.status(result.statusCode).json(result.body);
  });

  app.get("/mirror/runs", async (req, res) => {
    try {
      const limit = parsePositiveIntOrDefault(req.query.limit, 20, 200);
      const callerAgent =
        typeof req.query.caller_agent === "string" && req.query.caller_agent.trim().length > 0
          ? req.query.caller_agent.trim()
          : null;
      const status =
        typeof req.query.status === "string" && req.query.status.trim().length > 0
          ? req.query.status.trim()
          : null;
      const allowedStatuses: MirrorRunStatus[] = ["completed", "failed", "partial", "pending"];
      if (status && !allowedStatuses.includes(status as MirrorRunStatus)) {
        throw new PondOceanError(400, `status must be one of: ${allowedStatuses.join(", ")}`);
      }

      const entries = await serviceDeps.readMirrorJournal({ path: journalPath });
      const runs = buildMirrorRunSummaries(entries);
      const filtered = runs.filter((run) => {
        if (callerAgent && run.caller_agent !== callerAgent) {
          return false;
        }
        if (status && run.status !== status) {
          return false;
        }
        return true;
      });
      const limited = filtered.slice(0, limit);
      return res.status(200).json({
        count: limited.length,
        total: filtered.length,
        order: "newest-first",
        runs: limited,
      });
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: String(err) });
    }
  });

  app.get("/mirror/runs/:id", async (req, res) => {
    try {
      const runId = req.params.id;
      if (typeof runId !== "string" || runId.trim().length === 0) {
        throw new PondOceanError(400, "id must be a non-empty string");
      }
      const entries = await serviceDeps.readMirrorJournal({ path: journalPath });
      const matching = entries
        .filter((entry) => entry.trace_id === runId)
        .toSorted((a, b) => a.ts.localeCompare(b.ts));
      if (matching.length === 0) {
        throw new PondOceanError(404, `unknown run id: ${runId}`);
      }
      const summary = buildMirrorRunSummaries(matching)[0];
      if (!summary) {
        throw new PondOceanError(404, `unknown run id: ${runId}`);
      }
      const includeProviderSummary =
        req.query.include_provider_summary === "1" || req.query.include_provider_summary === "true";
      const providerSummary = includeProviderSummary
        ? await providerRuntime.summarizeRunViaProvider({
            summary,
            events: matching,
          })
        : undefined;
      return res.status(200).json({
        summary,
        order: "oldest-first",
        events: matching,
        provider_summary: providerSummary,
      });
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
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

  app.get("/ocean/ponds/:pond_id/evidence", async (req, res) => {
    try {
      const pondId = req.params.pond_id;
      if (typeof pondId !== "string" || pondId.trim().length === 0) {
        throw new PondOceanError(400, "pond_id must be a non-empty string");
      }

      const registry = await serviceDeps.readOceanRegistry(oceanRegistryPath);
      const pond = registry.ponds.find((entry) => entry.pond_id === pondId);
      if (!pond) {
        throw new PondOceanError(404, `unknown pond_id: ${pondId}`);
      }

      const evidence: Partial<OceanPondEntry> & { pond_id: string } = {
        pond_id: pond.pond_id,
        name: typeof pond.name === "string" ? pond.name : undefined,
        manifest_url: typeof pond.manifest_url === "string" ? pond.manifest_url : undefined,
        trust_status: pond.trust_status,
        pubkey_id: pond.pubkey_id,
        signature_ok: pond.signature_ok,
        last_handshake_at: pond.last_handshake_at,
        last_consult_at: pond.last_consult_at,
        last_consult_ok: pond.last_consult_ok,
        remote_runtime: pond.remote_runtime,
        remote_ocean_protocol: pond.remote_ocean_protocol,
        last_error: pond.last_error,
      };
      return res.status(200).json(evidence);
    } catch (err) {
      if (err instanceof PondOceanError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
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
