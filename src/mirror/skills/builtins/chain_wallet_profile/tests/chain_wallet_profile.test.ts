import { afterEach, describe, expect, it, vi } from "vitest";
import { getBuiltinMirrorSkills } from "../../../discover.js";
import { mirrorChainTokenBalanceSkill } from "../../chain_token_balance/skill.js";
import { mirrorChainWalletProfileSkill } from "../skill.js";

export function defineChainWalletProfileSkillTests() {
  describe("mirror.chain.wallet_profile skill", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("is registered in built-in skills", () => {
      expect(getBuiltinMirrorSkills().map((skill) => skill.meta.name)).toContain(
        "mirror.chain.wallet_profile",
      );
    });

    it("returns a wallet profile with balances", async () => {
      vi.spyOn(mirrorChainTokenBalanceSkill, "run").mockImplementation(async (input) => {
        const tokenAddress = String(input.tokenAddress);
        return {
          tokenAddress,
          walletAddress: String(input.walletAddress),
          balance: tokenAddress.endsWith("1") ? "100" : "0",
        };
      });

      const out = await mirrorChainWalletProfileSkill.run({
        walletAddress: "0x2222222222222222222222222222222222222222",
        rpcUrl: "https://rpc.example",
        tokens: [
          "0x1111111111111111111111111111111111111111",
          "0x3333333333333333333333333333333333333333",
        ],
      });

      expect(out).toEqual({
        walletAddress: "0x2222222222222222222222222222222222222222",
        balances: [
          { tokenAddress: "0x1111111111111111111111111111111111111111", balance: "100" },
          { tokenAddress: "0x3333333333333333333333333333333333333333", balance: "0" },
        ],
      });
    });

    it("handles an empty token list", async () => {
      const runSpy = vi.spyOn(mirrorChainTokenBalanceSkill, "run");

      const out = await mirrorChainWalletProfileSkill.run({
        walletAddress: "0x2222222222222222222222222222222222222222",
        rpcUrl: "https://rpc.example",
        tokens: [],
      });

      expect(out).toEqual({
        walletAddress: "0x2222222222222222222222222222222222222222",
        balances: [],
      });
      expect(runSpy).not.toHaveBeenCalled();
    });

    it("rejects invalid wallet input", async () => {
      await expect(
        mirrorChainWalletProfileSkill.run({
          walletAddress: "invalid",
          rpcUrl: "https://rpc.example",
          tokens: ["0x1111111111111111111111111111111111111111"],
        }),
      ).rejects.toThrow("requires a valid EVM wallet address");
    });
  });
}
