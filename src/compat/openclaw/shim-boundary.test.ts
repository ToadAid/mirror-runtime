import { describe, expect, it } from "vitest";
import * as shimMirrorCli from "../../cli/mirror-cli.js";
import * as canonicalMirrorCli from "../../mirror-cli/index.js";
import * as canonicalMirrorService from "../../mirror-service/index.js";
import * as shimRuntimeServer from "../../runtime/server.js";
import * as compatMirrorCli from "./cli/mirror-cli.js";
import * as compatRuntimeServer from "./runtime/server.js";

describe("compatibility shim boundaries", () => {
  it("keeps the runtime server shim as a thin forwarder to the compat runtime wrapper", () => {
    expect(Object.keys(shimRuntimeServer)).toEqual(["startRuntimeServer"]);
    expect(shimRuntimeServer.startRuntimeServer).toBe(compatRuntimeServer.startRuntimeServer);
    expect("startRuntimeServer" in canonicalMirrorService).toBe(false);
    expect("startMirrorService" in canonicalMirrorService).toBe(true);
  });

  it("keeps the mirror CLI shim as a thin forwarder to the compat CLI wrapper", () => {
    expect(Object.keys(shimMirrorCli)).toEqual(["registerMirrorCli"]);
    expect(shimMirrorCli.registerMirrorCli).toBe(compatMirrorCli.registerMirrorCli);
    expect("registerMirrorCli" in canonicalMirrorCli).toBe(false);
    expect("runMirrorCli" in canonicalMirrorCli).toBe(true);
  });
});
