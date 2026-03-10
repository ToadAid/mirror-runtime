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
