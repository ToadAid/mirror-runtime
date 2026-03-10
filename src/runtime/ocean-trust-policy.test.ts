import { describe, expect, it } from "vitest";
import { isOceanActionAllowed } from "./ocean-trust-policy.js";

describe("isOceanActionAllowed", () => {
  it("denies blocked pond for manifest.fetch and consult.read", () => {
    const fetchDecision = isOceanActionAllowed({
      trust_status: "blocked",
      action: "manifest.fetch",
    });
    const consultDecision = isOceanActionAllowed({
      trust_status: "blocked",
      action: "consult.read",
    });

    expect(fetchDecision.allowed).toBe(false);
    expect(fetchDecision.reason).toContain("denied");
    expect(consultDecision.allowed).toBe(false);
    expect(consultDecision.reason).toContain("denied");
  });

  it("allows known pond for manifest.fetch and consult.read", () => {
    const fetchDecision = isOceanActionAllowed({
      trust_status: "known",
      action: "manifest.fetch",
    });
    const consultDecision = isOceanActionAllowed({
      trust_status: "known",
      action: "consult.read",
    });

    expect(fetchDecision.allowed).toBe(true);
    expect(consultDecision.allowed).toBe(true);
  });

  it("allows trusted pond for manifest.fetch and consult.read", () => {
    const fetchDecision = isOceanActionAllowed({
      trust_status: "trusted",
      action: "manifest.fetch",
    });
    const consultDecision = isOceanActionAllowed({
      trust_status: "trusted",
      action: "consult.read",
    });

    expect(fetchDecision.allowed).toBe(true);
    expect(consultDecision.allowed).toBe(true);
  });

  it("denies future.act for all trust levels in v0", () => {
    const known = isOceanActionAllowed({
      trust_status: "known",
      action: "future.act",
    });
    const trusted = isOceanActionAllowed({
      trust_status: "trusted",
      action: "future.act",
    });
    const blocked = isOceanActionAllowed({
      trust_status: "blocked",
      action: "future.act",
    });

    expect(known.allowed).toBe(false);
    expect(trusted.allowed).toBe(false);
    expect(blocked.allowed).toBe(false);
    expect(known.reason).toContain("not enabled");
  });
});
