export type MirrorPassport = {
  kind: "mirror.passport";
  issuedAtIso: string;
  agentIdentity: {
    agentId: string;
    runId?: string;
  };
  localOnly?: {
    label: "LOCAL ONLY";
    travelerName?: string;
    hostName?: string;
    platform?: string;
    nodeVersion?: string;
    cwd?: string;
  };
};

export type BuildMirrorPassportOptions = {
  includeLocal?: boolean;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  hostName?: string;
  cwd?: string;
};
