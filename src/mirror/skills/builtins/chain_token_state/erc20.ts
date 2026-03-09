const ERC20_SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
} as const;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type RpcCallOptions = {
  rpcUrl: string;
  address: string;
  data: string;
  fetchImpl?: FetchLike;
};

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function decodeBytes32String(hex: string): string {
  const body = stripHexPrefix(hex).slice(0, 64);
  const buf = Buffer.from(body, "hex");
  return buf
    .toString("utf8")
    .replace(/\u0000+$/g, "")
    .trim();
}

function decodeAbiString(hex: string): string {
  const body = stripHexPrefix(hex);
  if (body.length < 64) {
    return decodeBytes32String(hex);
  }

  const offsetBytes = Number.parseInt(body.slice(0, 64), 16);
  const offset = offsetBytes * 2;
  if (!Number.isFinite(offset) || offset < 0 || offset + 64 > body.length) {
    return decodeBytes32String(hex);
  }

  const lenBytes = Number.parseInt(body.slice(offset, offset + 64), 16);
  const dataStart = offset + 64;
  const dataEnd = dataStart + lenBytes * 2;
  if (!Number.isFinite(lenBytes) || lenBytes < 0 || dataEnd > body.length) {
    return decodeBytes32String(hex);
  }

  const out = Buffer.from(body.slice(dataStart, dataEnd), "hex").toString("utf8").trim();
  return out.length > 0 ? out : decodeBytes32String(hex);
}

function decodeUint(hex: string): bigint {
  const body = stripHexPrefix(hex);
  if (body.length === 0) {
    throw new Error("Invalid uint response: empty result");
  }
  return BigInt(`0x${body}`);
}

async function ethCall(opts: RpcCallOptions): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available");
  }

  const response = await fetchImpl(opts.rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        {
          to: opts.address,
          data: opts.data,
        },
        "latest",
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(`RPC error: ${payload.error.message ?? "unknown error"}`);
  }

  if (typeof payload.result !== "string" || !payload.result.startsWith("0x")) {
    throw new Error("RPC error: invalid eth_call result");
  }

  return payload.result;
}

export async function readName(opts: Omit<RpcCallOptions, "data">): Promise<string> {
  const hex = await ethCall({ ...opts, data: ERC20_SELECTORS.name });
  return decodeAbiString(hex);
}

export async function readSymbol(opts: Omit<RpcCallOptions, "data">): Promise<string> {
  const hex = await ethCall({ ...opts, data: ERC20_SELECTORS.symbol });
  return decodeAbiString(hex);
}

export async function readDecimals(opts: Omit<RpcCallOptions, "data">): Promise<number> {
  const hex = await ethCall({ ...opts, data: ERC20_SELECTORS.decimals });
  const value = decodeUint(hex);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("RPC error: decimals exceeds safe number range");
  }
  return Number(value);
}

export async function readTotalSupply(opts: Omit<RpcCallOptions, "data">): Promise<string> {
  const hex = await ethCall({ ...opts, data: ERC20_SELECTORS.totalSupply });
  return decodeUint(hex).toString(10);
}
