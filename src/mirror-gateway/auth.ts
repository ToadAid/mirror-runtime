import type express from "express";
import type { MirrorSkillTool } from "../mirror/skills/index.js";

const OPERATOR_TOKEN_ENV = "MIRROR_OPERATOR_TOKEN";
const OPERATOR_HEADER = "x-mirror-operator-token";

export type MirrorGatewayAuthDecision = {
  allowed: boolean;
  statusCode?: number;
  error?: string;
};

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() ?? null;
}

export function getMirrorOperatorToken(): string | null {
  const value = process.env[OPERATOR_TOKEN_ENV];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function readMirrorRequestToken(req: express.Request): string | null {
  if (typeof req.header !== "function") {
    return null;
  }
  const headerValue = req.header(OPERATOR_HEADER);
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  return readBearerToken(req.header("authorization"));
}

export function requiresMirrorOperatorAuth(tool: MirrorSkillTool): boolean {
  return tool.metadata.access === "operator";
}

export function authorizeMirrorToolAccess(
  access: MirrorSkillTool["metadata"]["access"],
  providedToken: string | null,
): MirrorGatewayAuthDecision {
  if (access !== "operator") {
    return { allowed: true };
  }

  const expected = getMirrorOperatorToken();
  if (!expected) {
    return {
      allowed: false,
      statusCode: 503,
      error: "Mirror operator auth is not configured",
    };
  }

  if (providedToken !== expected) {
    return {
      allowed: false,
      statusCode: 403,
      error: "Mirror operator authorization required",
    };
  }

  return { allowed: true };
}

export function authorizeMirrorToolRequest(
  req: express.Request,
  tool: MirrorSkillTool,
): MirrorGatewayAuthDecision {
  return authorizeMirrorToolAccess(tool.metadata.access, readMirrorRequestToken(req));
}
