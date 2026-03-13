// Archived builtin retained for tests and explicit compatibility references only.
// The standalone Mirror product surface does not ship the chain skill family.
import type { MirrorSkill } from "../../types.js";
import { readBalanceOf } from "./erc20.js";
import type { ChainTokenBalanceInput, ChainTokenBalanceResult } from "./types.js";

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function validateInput(input: Record<string, unknown>): ChainTokenBalanceInput {
  const tokenAddress = input.tokenAddress;
  const walletAddress = input.walletAddress;
  const rpcUrl = input.rpcUrl;

  if (typeof tokenAddress !== "string" || !ETH_ADDRESS_REGEX.test(tokenAddress)) {
    throw new TypeError("mirror.chain.token_balance requires a valid EVM token address");
  }
  if (typeof walletAddress !== "string" || !ETH_ADDRESS_REGEX.test(walletAddress)) {
    throw new TypeError("mirror.chain.token_balance requires a valid EVM wallet address");
  }
  if (typeof rpcUrl !== "string" || rpcUrl.trim().length === 0) {
    throw new TypeError("mirror.chain.token_balance requires input.rpcUrl");
  }

  return {
    tokenAddress,
    walletAddress,
    rpcUrl,
  };
}

async function runChainTokenBalance(
  input: Record<string, unknown>,
): Promise<ChainTokenBalanceResult> {
  const params = validateInput(input);
  const balance = await readBalanceOf(params.tokenAddress, params.walletAddress, params.rpcUrl);

  return {
    tokenAddress: params.tokenAddress,
    walletAddress: params.walletAddress,
    balance,
  };
}

export const mirrorChainTokenBalanceSkill: MirrorSkill = {
  meta: {
    name: "mirror.chain.token_balance",
    description: "Fetches the ERC-20 token balance of a wallet using JSON-RPC",
    version: "1.0.0",
    inputs: ["tokenAddress", "walletAddress", "rpcUrl"],
    outputs: ["tokenAddress", "walletAddress", "balance"],
  },
  async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return runChainTokenBalance(input);
  },
};
