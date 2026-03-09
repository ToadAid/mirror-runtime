import { afterEach, describe, expect, it, vi } from "vitest";
import { getBuiltinMirrorSkills } from "../../../discover.js";
import { mirrorChainTokenBalanceSkill } from "../skill.js";

function encodeUint(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function mockRpcFetch(resultHex?: string) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
      params?: Array<{ data?: string }>;
    };

    if (body.method === "eth_call" && String(body.params?.[0]?.data).startsWith("0x70a08231")) {
      if (resultHex) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { jsonrpc: "2.0", id: 1, result: resultHex };
          },
        } as Response;
      }
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return { jsonrpc: "2.0", id: 1, error: { message: "method failure" } };
      },
    } as Response;
  });
}

export function defineChainTokenBalanceSkillTests() {
  describe("mirror.chain.token_balance skill", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("is registered in built-in skills", () => {
      expect(getBuiltinMirrorSkills().map((skill) => skill.meta.name)).toContain(
        "mirror.chain.token_balance",
      );
    });

    it("returns balance for a valid call", async () => {
      globalThis.fetch = mockRpcFetch(encodeUint(123456789n)) as typeof globalThis.fetch;

      const result = await mirrorChainTokenBalanceSkill.run({
        tokenAddress: "0x2222222222222222222222222222222222222222",
        walletAddress: "0x3333333333333333333333333333333333333333",
        rpcUrl: "https://rpc.example",
      });

      expect(result).toEqual({
        tokenAddress: "0x2222222222222222222222222222222222222222",
        walletAddress: "0x3333333333333333333333333333333333333333",
        balance: "123456789",
      });
    });

    it("rejects invalid addresses", async () => {
      await expect(
        mirrorChainTokenBalanceSkill.run({
          tokenAddress: "invalid",
          walletAddress: "0x3333333333333333333333333333333333333333",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("requires a valid tokenAddress");

      await expect(
        mirrorChainTokenBalanceSkill.run({
          tokenAddress: "0x2222222222222222222222222222222222222222",
          walletAddress: "invalid",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("requires a valid walletAddress");
    });

    it("handles RPC failures", async () => {
      globalThis.fetch = mockRpcFetch() as typeof globalThis.fetch;

      await expect(
        mirrorChainTokenBalanceSkill.run({
          tokenAddress: "0x2222222222222222222222222222222222222222",
          walletAddress: "0x3333333333333333333333333333333333333333",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("RPC error");
    });
  });
}
