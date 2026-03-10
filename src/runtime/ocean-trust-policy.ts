export type OceanTrustStatus = "known" | "trusted" | "blocked";

export type OceanAction = "manifest.fetch" | "consult.read" | "future.act";

export type OceanActionDecision = {
  allowed: boolean;
  reason: string;
  effectiveTrustStatus: OceanTrustStatus;
};

export function isOceanActionAllowed(params: {
  trust_status: OceanTrustStatus | undefined;
  action: OceanAction;
}): OceanActionDecision {
  const effectiveTrustStatus = params.trust_status ?? "known";

  if (params.action === "future.act") {
    return {
      allowed: false,
      reason: "future.act is not enabled in v0",
      effectiveTrustStatus,
    };
  }

  if (effectiveTrustStatus === "blocked") {
    return {
      allowed: false,
      reason: `${params.action} denied: pond trust_status is blocked`,
      effectiveTrustStatus,
    };
  }

  return {
    allowed: true,
    reason: `${params.action} allowed for trust_status=${effectiveTrustStatus}`,
    effectiveTrustStatus,
  };
}
