// Archived builtin retained for tests and explicit compatibility references only.
// The standalone Mirror product surface does not ship the chain skill family.
import type { MirrorSkill } from "../../types.js";
import { readDecimals, readName, readSymbol, readTotalSupply } from "./erc20.js";
import type { ChainTokenStateInput, ChainTokenStateResult } from "./types.js";

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function validateInput(input: Record<string, unknown>): ChainTokenStateInput {
  const address = input.address;
  const rpcUrl = input.rpcUrl;

  if (typeof address !== "string" || !ETH_ADDRESS_REGEX.test(address)) {
    throw new TypeError("mirror.chain.token_state requires a valid EVM token address");
  }
  if (typeof rpcUrl !== "string" || rpcUrl.trim().length === 0) {
    throw new TypeError("mirror.chain.token_state requires input.rpcUrl");
  }

  return {
    address,
    rpcUrl,
  };
}

async function runChainTokenState(input: Record<string, unknown>): Promise<ChainTokenStateResult> {
  const params = validateInput(input);

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    readName(params),
    readSymbol(params),
    readDecimals(params),
    readTotalSupply(params),
  ]);

  return {
    address: params.address,
    name,
    symbol,
    decimals,
    totalSupply,
    rpcUrl: params.rpcUrl,
  };
}

export const mirrorChainTokenStateSkill: MirrorSkill = {
  meta: {
    name: "mirror.chain.token_state",
    description: "Read ERC-20 token metadata and supply",
    version: "1.0.0",
    inputs: ["address", "rpcUrl"],
    outputs: ["address", "name", "symbol", "decimals", "totalSupply"],
  },
  async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return runChainTokenState(input);
  },
};
