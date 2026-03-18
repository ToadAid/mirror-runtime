import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authorizeMirrorMutableSurfaceAccess,
  authorizeMirrorSettingsWriteRequest,
} from "./auth.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalOperatorToken === undefined) {
    delete process.env.MIRROR_OPERATOR_TOKEN;
  } else {
    process.env.MIRROR_OPERATOR_TOKEN = originalOperatorToken;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-auth-"));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

function createRequest(token?: string) {
  return {
    header(name: string) {
      if (name.toLowerCase() === "x-mirror-operator-token") {
        return token;
      }
      return undefined;
    },
  };
}

describe("mirror gateway auth", () => {
  it("denies mutable surface access when operator auth is unconfigured", async () => {
    await createTempHome();
    delete process.env.MIRROR_OPERATOR_TOKEN;

    expect(authorizeMirrorMutableSurfaceAccess(null)).toEqual({
      allowed: false,
      code: "mutable_surface_auth_unconfigured",
      statusCode: 503,
      error: "Mirror operator auth is not configured",
    });
  });

  it("denies settings writes when operator token is wrong", async () => {
    await createTempHome();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    expect(authorizeMirrorSettingsWriteRequest(createRequest("wrong") as never)).toEqual({
      allowed: false,
      code: "mutable_surface_auth_required",
      statusCode: 403,
      error: "Mirror operator authorization required",
    });
  });

  it("allows settings writes when operator token matches", async () => {
    await createTempHome();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    expect(authorizeMirrorSettingsWriteRequest(createRequest("secret") as never)).toEqual({
      allowed: true,
    });
  });
});
