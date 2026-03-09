const BALANCE_OF_SELECTOR = "0x70a08231";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function encodeAddressArg(address: string): string {
  return stripHexPrefix(address).toLowerCase().padStart(64, "0");
}

function decodeUint256(hex: string): string {
  const body = stripHexPrefix(hex);
  if (body.length === 0) {
    throw new Error("RPC error: empty balanceOf result");
  }
  return BigInt(`0x${body}`).toString(10);
}

export async function readBalanceOf(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl: string,
  fetchImpl?: FetchLike,
): Promise<string> {
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new Error("Fetch API is not available");
  }

  const data = `${BALANCE_OF_SELECTOR}${encodeAddressArg(walletAddress)}`;

  const response = await fetcher(rpcUrl, {
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
          to: tokenAddress,
          data,
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

  return decodeUint256(payload.result);
}
