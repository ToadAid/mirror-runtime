export type MirrorDaemonTrustStatus = "known" | "trusted" | "blocked";

export type MirrorDaemonClientOptions = {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  token?: string;
};

export type MirrorApiPondManifest = {
  pond_id: string;
  name: string;
  runtime: string;
  runtime_version: string;
  ocean_protocol: string;
  federation_enabled: boolean;
  public: boolean;
  capabilities: string[];
  agents: string[];
  [key: string]: unknown;
};

export type MirrorApiOceanPondEntry = {
  pond_id: string;
  trust_status?: MirrorDaemonTrustStatus;
  [key: string]: unknown;
};

export type MirrorApiOceanPondsList = {
  count: number;
  ponds: MirrorApiOceanPondEntry[];
};

export type MirrorApiPondRefreshResponse = {
  ok: boolean;
  path: string;
  pond: MirrorApiPondManifest;
};

export type MirrorApiOceanUpsertResponse = {
  success: boolean;
  pond: MirrorApiOceanPondEntry;
};

export type MirrorApiOceanConsultResponse = {
  source_pond: string;
  source_url: string;
  fetched_at: string;
  signature_ok: boolean;
  payload: unknown;
};

export type MirrorApiOceanStatusResponse = {
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

export type MirrorApiRunStatus = "completed" | "failed" | "partial" | "pending";

export type MirrorApiRunSummary = {
  run_id: string;
  trace_id: string;
  caller_agent: string | null;
  started_at: string;
  ended_at: string;
  tool_count: number;
  approval_count: number;
  status: MirrorApiRunStatus;
  last_event_type: string;
  [key: string]: unknown;
};

export type MirrorApiRunsListResponse = {
  count: number;
  total: number;
  order: string;
  runs: MirrorApiRunSummary[];
};

export type MirrorApiRunDetailResponse = {
  summary: MirrorApiRunSummary;
  order: string;
  events: Array<Record<string, unknown>>;
};

export type MirrorApiOceanEvidenceResponse = {
  pond_id: string;
  name?: string;
  manifest_url?: string;
  trust_status?: MirrorDaemonTrustStatus;
  pubkey_id?: string;
  signature_ok?: boolean;
  last_handshake_at?: string;
  last_consult_at?: string;
  last_consult_ok?: boolean;
  remote_runtime?: string;
  remote_ocean_protocol?: string;
  last_error?: string;
  [key: string]: unknown;
};

export type MirrorApiJournalEntry = {
  ts: string;
  event_type: string;
  trace_id: string;
  caller_agent?: string;
  tool_name?: string;
  decision?: string;
  risk_tier?: string;
  reason?: string;
  args_hash?: string;
  approval_id?: string;
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type MirrorApiJournalResponse = {
  count: number;
  order: string;
  entries: MirrorApiJournalEntry[];
};

export type MirrorApiProviderStatusResponse = {
  provider: string;
  default_model: string;
  source: {
    runtime_snapshot: boolean;
  };
  provider_env: {
    MIRROR_PROVIDER: string;
    MIRROR_PROVIDER_MODEL: string;
  };
  adapter?: string;
  invocation_summary?: {
    last_invoked_at: string;
    last_provider: string;
    last_model: string;
    last_outcome: "ok" | "error";
    last_error?: string;
  } | null;
  recent_invocations?: Array<{
    invoked_at: string;
    provider: string;
    model: string;
    outcome: "ok" | "error";
    error?: string;
  }>;
  evidence?: {
    effective_provider: string;
    effective_model: string;
    alias_normalized_from?: string;
    auth_source: "configured_token" | "resolved_credentials" | "none";
    credential_resolution_attempted: boolean;
    credential_resolution_ok?: boolean;
    last_error?: string;
  };
  [key: string]: unknown;
};

export type MirrorApiProviderHealthResponse = {
  provider: string;
  model: string;
  configured: boolean;
  reachable: boolean;
  ok: boolean;
  error?: string;
  source: {
    runtime_snapshot: boolean;
  };
  invocation_summary?: {
    last_invoked_at: string;
    last_provider: string;
    last_model: string;
    last_outcome: "ok" | "error";
    last_error?: string;
  } | null;
  recent_invocations?: Array<{
    invoked_at: string;
    provider: string;
    model: string;
    outcome: "ok" | "error";
    error?: string;
  }>;
  evidence?: {
    effective_provider: string;
    effective_model: string;
    alias_normalized_from?: string;
    auth_source: "configured_token" | "resolved_credentials" | "none";
    credential_resolution_attempted: boolean;
    credential_resolution_ok?: boolean;
    last_error?: string;
  };
  [key: string]: unknown;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl && baseUrl.trim().length > 0) {
    return baseUrl.replace(/\/+$/, "");
  }
  const port = process.env.MIRROR_DAEMON_PORT?.trim() || "8787";
  return `http://127.0.0.1:${port}`;
}

function buildPathWithQuery(
  pathname: string,
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    const text = typeof value === "number" ? String(value) : value;
    if (text.trim().length === 0) {
      continue;
    }
    params.set(key, text);
  }
  const encoded = params.toString();
  return encoded.length > 0 ? `${pathname}?${encoded}` : pathname;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text.trim().length > 0 ? text : null;
}

function buildErrorMessage(
  method: string,
  url: string,
  status: number | undefined,
  payload: unknown,
  cause: unknown,
): string {
  if (isRecord(payload) && typeof payload.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message;
  }
  const statusText = typeof status === "number" ? ` (HTTP ${status})` : "";
  return `MirrorDaemon request failed: ${method} ${url}${statusText}`;
}

export class MirrorDaemonClientError extends Error {
  readonly status: number | undefined;
  readonly url: string;
  readonly method: string;
  readonly payload: unknown;

  constructor(params: {
    message: string;
    status?: number;
    url: string;
    method: string;
    payload?: unknown;
    cause?: unknown;
  }) {
    super(params.message, params.cause !== undefined ? { cause: params.cause } : undefined);
    this.status = params.status;
    this.url = params.url;
    this.method = params.method;
    this.payload = params.payload;
  }
}

async function requestJson<T>(
  path: string,
  opts: MirrorDaemonClientOptions,
  request: RequestOptions = {},
): Promise<T> {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const fetchFn = opts.fetchFn ?? fetch;
  const method = request.method ?? "GET";
  const url = `${baseUrl}${path}`;

  try {
    const token = opts.token?.trim() || process.env.MIRROR_DAEMON_TOKEN?.trim();
    const headers: Record<string, string> = {};
    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (token && token.length > 0) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchFn(url, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    });
    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new MirrorDaemonClientError({
        message: buildErrorMessage(method, url, response.status, payload, null),
        status: response.status,
        url,
        method,
        payload,
      });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof MirrorDaemonClientError) {
      throw error;
    }
    throw new MirrorDaemonClientError({
      message: buildErrorMessage(method, url, undefined, null, error),
      status: undefined,
      url,
      method,
      cause: error,
    });
  }
}

export async function getPondManifest(
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiPondManifest> {
  return await requestJson<MirrorApiPondManifest>("/pond/manifest", options);
}

export async function refreshPond(
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiPondRefreshResponse> {
  return await requestJson<MirrorApiPondRefreshResponse>("/pond/refresh", options, {
    method: "POST",
    body: {},
  });
}

export async function listOceanPonds(
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanPondsList> {
  return await requestJson<MirrorApiOceanPondsList>("/ocean/ponds", options);
}

export async function upsertOceanPond(
  params: Record<string, unknown>,
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanUpsertResponse> {
  return await requestJson<MirrorApiOceanUpsertResponse>("/ocean/ponds", options, {
    method: "POST",
    body: params,
  });
}

export async function fetchOceanPond(
  manifestUrl: string,
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanUpsertResponse> {
  return await requestJson<MirrorApiOceanUpsertResponse>("/ocean/ponds/fetch", options, {
    method: "POST",
    body: { manifest_url: manifestUrl },
  });
}

export async function updateOceanTrust(
  pondId: string,
  trustStatus: MirrorDaemonTrustStatus,
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanPondEntry> {
  return await requestJson<MirrorApiOceanPondEntry>("/ocean/ponds/trust", options, {
    method: "POST",
    body: { pond_id: pondId, trust_status: trustStatus },
  });
}

export async function consultOcean(
  pondId: string,
  query: unknown,
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanConsultResponse> {
  return await requestJson<MirrorApiOceanConsultResponse>("/ocean/consult", options, {
    method: "POST",
    body: { pond_id: pondId, request: query },
  });
}

export async function getOceanStatus(
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanStatusResponse> {
  return await requestJson<MirrorApiOceanStatusResponse>("/ocean/status", options);
}

export async function listMirrorRuns(
  params: {
    limit?: number;
    callerAgent?: string;
    status?: MirrorApiRunStatus;
  } = {},
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiRunsListResponse> {
  const path = buildPathWithQuery("/mirror/runs", {
    limit: params.limit,
    caller_agent: params.callerAgent,
    status: params.status,
  });
  return await requestJson<MirrorApiRunsListResponse>(path, options);
}

export async function getMirrorRun(
  id: string,
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiRunDetailResponse> {
  return await requestJson<MirrorApiRunDetailResponse>(
    `/mirror/runs/${encodeURIComponent(id)}`,
    options,
  );
}

export async function getOceanEvidence(
  pondId: string,
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiOceanEvidenceResponse> {
  return await requestJson<MirrorApiOceanEvidenceResponse>(
    `/ocean/ponds/${encodeURIComponent(pondId)}/evidence`,
    options,
  );
}

export async function listMirrorJournal(
  params: {
    limit?: number;
    type?: string;
    traceId?: string;
  } = {},
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiJournalResponse> {
  const path = buildPathWithQuery("/mirror/journal", {
    limit: params.limit,
    type: params.type,
    trace_id: params.traceId,
  });
  return await requestJson<MirrorApiJournalResponse>(path, options);
}

export async function getMirrorProviderStatus(
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiProviderStatusResponse> {
  return await requestJson<MirrorApiProviderStatusResponse>("/mirror/provider/status", options);
}

export async function getMirrorProviderHealth(
  options: MirrorDaemonClientOptions = {},
): Promise<MirrorApiProviderHealthResponse> {
  return await requestJson<MirrorApiProviderHealthResponse>("/mirror/provider/health", options);
}
