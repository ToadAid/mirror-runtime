import { afterEach, describe, expect, it } from "vitest";
import {
  buildMirrorActionPolicyTarget,
  buildMirrorAdapterPolicyTarget,
  buildMirrorChatPolicyTarget,
  buildMirrorProviderPolicyTarget,
  buildMirrorToolPolicyTarget,
  createMirrorPolicyEngine,
  MirrorPolicyDeniedError,
  ensureMirrorPolicyAllowed,
  type MirrorPolicyContext,
} from "./index.js";

function buildContext(overrides: Partial<MirrorPolicyContext> = {}): MirrorPolicyContext {
  return {
    surface: "service",
    ...overrides,
  };
}

const originalOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;

afterEach(() => {
  if (originalOperatorToken === undefined) {
    delete process.env.MIRROR_OPERATOR_TOKEN;
    return;
  }
  process.env.MIRROR_OPERATOR_TOKEN = originalOperatorToken;
});

describe("mirror policy engine", () => {
  it("denies operator tools without a valid operator token", async () => {
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const engine = createMirrorPolicyEngine();

    const result = await engine.evaluate({
      phase: "ingress",
      target: buildMirrorToolPolicyTarget(
        {
          metadata: {
            name: "mirror.commit-scroll",
            access: "operator",
          },
        } as never,
        { draft_scroll_content: "# draft" },
      ),
      context: buildContext(),
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.code).toBe("operator_auth_required");
  });

  it("allows operator tools when the operator token matches", async () => {
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const engine = createMirrorPolicyEngine();

    const result = await engine.evaluate({
      phase: "ingress",
      target: buildMirrorToolPolicyTarget(
        {
          metadata: {
            name: "mirror.commit-scroll",
            access: "operator",
          },
        } as never,
        { draft_scroll_content: "# draft" },
      ),
      context: buildContext({
        request_token: "secret",
      }),
    });

    expect(result.allowed).toBe(true);
    expect(result.decision.code).toBe("allowed");
  });

  it("allows chat, provider, action, and adapter targets by default", async () => {
    const engine = createMirrorPolicyEngine();

    await expect(
      engine.evaluate({
        phase: "ingress",
        target: buildMirrorChatPolicyTarget({
          model: "mirror-model",
          messages: [{ role: "user", content: "hello" }],
        }),
        context: buildContext(),
      }),
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      engine.evaluate({
        phase: "provider",
        target: buildMirrorProviderPolicyTarget(
          { model: "mirror-model" },
          { url: "https://provider.example" },
        ),
        context: buildContext(),
      }),
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      engine.evaluate({
        phase: "action",
        target: buildMirrorActionPolicyTarget("sync.pull", { peer_id: "peer-a" }),
        context: buildContext({
          surface: "cli",
        }),
      }),
    ).resolves.toMatchObject({ allowed: true });

    await expect(
      engine.evaluate({
        phase: "adapter",
        target: buildMirrorAdapterPolicyTarget({
          adapter: {
            adapter_id: "telegram-main",
            surface: "telegram",
            transport: "bot_api",
            capabilities: ["chat", "threads"],
          },
          envelopeKind: "chat.request",
        }),
        context: buildContext({
          surface: "adapter",
        }),
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("throws a typed error when a policy result is denied", async () => {
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const engine = createMirrorPolicyEngine();
    const result = await engine.evaluate({
      phase: "ingress",
      target: buildMirrorToolPolicyTarget(
        {
          metadata: {
            name: "mirror.commit-scroll",
            access: "operator",
          },
        } as never,
        { draft_scroll_content: "# draft" },
      ),
      context: buildContext(),
    });

    expect(() => ensureMirrorPolicyAllowed(result)).toThrow(MirrorPolicyDeniedError);
  });
});
