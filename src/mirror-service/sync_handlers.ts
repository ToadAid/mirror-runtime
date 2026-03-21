import express from "express";
import { readMirrorRequestToken } from "../mirror-gateway/auth.js";
import {
  buildMirrorActionPolicyTarget,
  type MirrorPolicyContext,
  type MirrorPolicyEngine,
} from "../mirror-policy/index.js";
import {
  executeMirrorSyncAction,
  parseMirrorSyncAnnounceInput,
  parseMirrorSyncPullInput,
  parseMirrorSyncUpdatesInput,
  type MirrorSyncHandlers,
  type MirrorSyncManager,
  type MirrorSyncPolicyActionName,
  wrapMirrorSyncPullResponse,
} from "../mirror-sync/index.js";
import type { Mirrordaemon } from "../mirrordaemon/index.js";

type CreateMirrorServiceSyncHandlersOptions = {
  daemon: Mirrordaemon;
  policy: MirrorPolicyEngine;
  syncManager: MirrorSyncManager;
};

type MirrorSyncPolicyDecision =
  | { allowed: true }
  | { allowed: false; statusCode: number; body: Record<string, unknown> };

function getRequestBody(req: express.Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

async function evaluateSyncPolicy(
  req: express.Request,
  actionName: MirrorSyncPolicyActionName,
  options: CreateMirrorServiceSyncHandlersOptions,
): Promise<MirrorSyncPolicyDecision> {
  const header =
    typeof req.header === "function"
      ? (name: string) => req.header(name)
      : (_name: string) => undefined;
  const body = getRequestBody(req);
  const policyContext: MirrorPolicyContext = {
    surface: "sync",
    route: typeof req.path === "string" ? req.path : "",
    request_token: readMirrorRequestToken(req),
    session: {
      session_id: header("x-mirror-session-id") ?? undefined,
    },
    metadata: {
      method: typeof req.method === "string" ? req.method : "UNKNOWN",
    },
  };
  const decision = await options.policy.evaluate({
    phase: "action",
    target: buildMirrorActionPolicyTarget(actionName, body),
    context: policyContext,
  });
  if (decision.allowed) {
    return { allowed: true };
  }
  options.daemon.publishRuntimeEvent("policy.denied", {
    phase: "action",
    target: "action",
    action: actionName,
    code: decision.decision.code,
    route: req.path,
  });
  return {
    allowed: false,
    statusCode: decision.decision.statusCode ?? 403,
    body: {
      error: decision.decision.reason,
      code: decision.decision.code,
    },
  };
}

export function createMirrorServiceSyncHandlers(
  options: CreateMirrorServiceSyncHandlersOptions,
): MirrorSyncHandlers {
  return {
    announce: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.announce", options);
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      const payload = parseMirrorSyncAnnounceInput(req);
      const response = !payload
        ? res.status(400).json({ error: "peer_id and base_url are required" })
        : res.json(await executeMirrorSyncAction(options.syncManager, "announce", payload));
      options.daemon.publishRuntimeEvent("sync.announce", {
        peer_id: getRequestBody(req).peer_id,
      });
      return response;
    },
    peers: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.peers", options);
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      return res.json(await executeMirrorSyncAction(options.syncManager, "peers"));
    },
    updates: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.updates", options);
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      return res.json(
        await executeMirrorSyncAction(
          options.syncManager,
          "updates",
          parseMirrorSyncUpdatesInput(req),
        ),
      );
    },
    pull: async (req: express.Request, res: express.Response) => {
      const policyDecision = await evaluateSyncPolicy(req, "sync.pull", options);
      if (!policyDecision.allowed) {
        return res.status(policyDecision.statusCode).json(policyDecision.body);
      }
      const payload = parseMirrorSyncPullInput(req);
      const response = await wrapMirrorSyncPullResponse(
        res,
        async () => await executeMirrorSyncAction(options.syncManager, "pull", payload),
      );
      options.daemon.publishRuntimeEvent("sync.pull", {
        peer_id: getRequestBody(req).peer_id,
      });
      return response;
    },
  } satisfies MirrorSyncHandlers;
}
