const BALANCE_OF_SELECTOR = "0x70a08231";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function encodeAddressArg(address: string): string {
  return stripHexPrefix(address).toLowerCase().padStart(64, "0");
}

function decodeUint(hex: string): bigint {
  const body = stripHexPrefix(hex);
  if (body.length === 0) {
    throw new Error("Invalid uint response: empty result");
  }
  return BigInt(`0x${body}`);
}

async function ethCall(opts: {
  tokenAddress: string;
  rpcUrl: string;
  data: string;
  fetchImpl?: FetchLike;
}): Promise<string> {
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
          to: opts.tokenAddress,
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

export function buildBalanceOfCallData(walletAddress: string): string {
  return `${BALANCE_OF_SELECTOR}${encodeAddressArg(walletAddress)}`;
}

export async function readBalanceOf(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string,
  fetchImpl?: FetchLike,
): Promise<string> {
  const hex = await ethCall({
    tokenAddress,
    rpcUrl,
    data: buildBalanceOfCallData(walletAddress),
    fetchImpl,
  });
  return decodeUint(hex).toString(10);
}
