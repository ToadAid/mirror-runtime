import { afterEach, describe, expect, it, vi } from "vitest";
import { getBuiltinMirrorSkills } from "../../../discover.js";
import { mirrorChainTokenStateSkill } from "../skill.js";

type RpcResponseMap = Record<string, string>;

function encodeString(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  const offset = "0000000000000000000000000000000000000000000000000000000000000020";
  const len = value.length.toString(16).padStart(64, "0");
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64 || 64, "0");
  return `0x${offset}${len}${padded}`;
}

function encodeUint(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function mockRpcFetch(map: RpcResponseMap) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      params?: Array<{ data?: string }>;
    };
    const selector = body.params?.[0]?.data ?? "";

    if (selector in map) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { jsonrpc: "2.0", id: 1, result: map[selector] };
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

export function defineChainTokenStateSkillTests() {
  describe("mirror.chain.token_state skill", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("is registered in built-in skills", () => {
      expect(getBuiltinMirrorSkills().map((skill) => skill.meta.name)).toContain(
        "mirror.chain.token_state",
      );
    });

    it("returns expected token state structure", async () => {
      globalThis.fetch = mockRpcFetch({
        "0x06fdde03": encodeString("Toby Token"),
        "0x95d89b41": encodeString("TOBY"),
        "0x313ce567": encodeUint(18n),
        "0x18160ddd": encodeUint(1_000_000n),
      }) as typeof globalThis.fetch;

      const out = await mirrorChainTokenStateSkill.run({
        address: "0x1111111111111111111111111111111111111111",
        rpcUrl: "https://rpc.example",
      });

      expect(out).toEqual({
        address: "0x1111111111111111111111111111111111111111",
        name: "Toby Token",
        symbol: "TOBY",
        decimals: 18,
        totalSupply: "1000000",
        rpcUrl: "https://rpc.example",
      });
    });

    it("rejects invalid token address", async () => {
      await expect(
        mirrorChainTokenStateSkill.run({
          address: "invalid",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("requires a valid EVM token address");
    });

    it("handles RPC failures", async () => {
      globalThis.fetch = mockRpcFetch({}) as typeof globalThis.fetch;

      await expect(
        mirrorChainTokenStateSkill.run({
          address: "0x1111111111111111111111111111111111111111",
          rpcUrl: "https://rpc.example",
        }),
      ).rejects.toThrow("RPC error");
    });
  });
}
