import type { MirrorSkill } from "../../types.js";
import { mirrorChainTokenBalanceSkill } from "../chain_token_balance/skill.js";
import type { ChainWalletProfileInput, ChainWalletProfileResult } from "./types.js";

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function validateInput(input: Record<string, unknown>): ChainWalletProfileInput {
  const walletAddress = input.walletAddress;
  const rpcUrl = input.rpcUrl;
  const tokens = input.tokens;

  if (typeof walletAddress !== "string" || !ETH_ADDRESS_REGEX.test(walletAddress)) {
    throw new TypeError("mirror.chain.wallet_profile requires a valid EVM wallet address");
  }
  if (typeof rpcUrl !== "string" || rpcUrl.trim().length === 0) {
    throw new TypeError("mirror.chain.wallet_profile requires input.rpcUrl");
  }
  if (!Array.isArray(tokens) || !tokens.every((token) => typeof token === "string")) {
    throw new TypeError("mirror.chain.wallet_profile requires input.tokens string[]");
  }

  return {
    walletAddress,
    rpcUrl,
    tokens,
  };
}

async function runChainWalletProfile(
  input: Record<string, unknown>,
): Promise<ChainWalletProfileResult> {
  const params = validateInput(input);

  const balances = await Promise.all(
    params.tokens.map(async (tokenAddress) => {
      const result = await mirrorChainTokenBalanceSkill.run({
        tokenAddress,
        walletAddress: params.walletAddress,
        rpcUrl: params.rpcUrl,
      });

      return {
        tokenAddress,
        balance: String(result.balance),
      };
    }),
  );

  return {
    walletAddress: params.walletAddress,
    balances,
  };
}

export const mirrorChainWalletProfileSkill: MirrorSkill = {
  meta: {
    name: "mirror.chain.wallet_profile",
    description: "Builds a wallet profile by checking balances of multiple ERC-20 tokens",
    version: "1.0.0",
    inputs: ["walletAddress", "rpcUrl", "tokens"],
    outputs: ["walletAddress", "balances"],
  },
  async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return runChainWalletProfile(input);
  },
};
