import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRequestBodyJson } from "../../../../../test/request_init.js";
import { getBuiltinMirrorSkills } from "../../../discover.js";
import { buildBalanceOfCallData } from "../erc20.js";
import { mirrorChainTokenBalanceSkill } from "../skill.js";

function encodeUint(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function mockRpcFetch(resultByData: Record<string, string>) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = parseRequestBodyJson<{
      params?: Array<{ data?: string }>;
    }>({
      ...init,
      body: typeof init?.body === "string" ? init.body : "{}",
    });

    const data = body.params?.[0]?.data ?? "";
    if (data in resultByData) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { jsonrpc: "2.0", id: 1, result: resultByData[data] };
        },
      } as Response;
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

    it("returns expected balance structure", async () => {
      const walletAddress = "0x2222222222222222222222222222222222222222";
      globalThis.fetch = mockRpcFetch({
        [buildBalanceOfCallData(walletAddress)]: encodeUint(123n),
      }) as typeof globalThis.fetch;

      const out = await mirrorChainTokenBalanceSkill.run({
        tokenAddress: "0x1111111111111111111111111111111111111111",
        walletAddress,
        rpcUrl: "https://rpc.example",
      });

      expect(out).toEqual({
        tokenAddress: "0x1111111111111111111111111111111111111111",
        walletAddress,
        balance: "123",
      });
    });

    it("rejects invalid wallet address", async () => {
      await expect(
        mirrorChainTokenBalanceSkill.run({
          tokenAddress: "0x1111111111111111111111111111111111111111",
          walletAddress: "invalid",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("requires a valid EVM wallet address");
    });

    it("handles RPC failures", async () => {
      globalThis.fetch = mockRpcFetch({}) as typeof globalThis.fetch;

      await expect(
        mirrorChainTokenBalanceSkill.run({
          tokenAddress: "0x1111111111111111111111111111111111111111",
          walletAddress: "0x2222222222222222222222222222222222222222",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("RPC error");
    });
  });
}
