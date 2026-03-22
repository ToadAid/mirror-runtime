import { describe, expect, it } from "vitest";
import * as compatBrainChat from "../compat/openclaw/runtime/brain-chat.js";
import * as compatHealth from "../compat/openclaw/runtime/health.js";
import * as canonicalMirrorRuntime from "../mirror-runtime/index.js";
import * as canonicalMirrorService from "../mirror-service/index.js";
import * as shimBrainChat from "./brain-chat.js";
import * as shimHealth from "./health.js";

describe("legacy runtime compatibility boundaries", () => {
  it("keeps the brain-chat legacy entrypoint as a thin forwarder to compat runtime code", () => {
    expect(Object.keys(shimBrainChat)).toEqual(["handleBrainChatEndpoint"]);
    expect(shimBrainChat.handleBrainChatEndpoint).toBe(compatBrainChat.handleBrainChatEndpoint);
    expect("handleBrainChatEndpoint" in canonicalMirrorRuntime).toBe(false);
    expect("executeMirrorChatRequest" in canonicalMirrorRuntime).toBe(true);
    expect("handleBrainChatEndpoint" in canonicalMirrorService).toBe(false);
  });

  it("keeps the health legacy entrypoint as a thin forwarder to compat runtime code", () => {
    expect(Object.keys(shimHealth)).toEqual(["handleHealthEndpoint"]);
    expect(shimHealth.handleHealthEndpoint).toBe(compatHealth.handleHealthEndpoint);
    expect("handleHealthEndpoint" in canonicalMirrorRuntime).toBe(false);
    expect("handleHealthEndpoint" in canonicalMirrorService).toBe(false);
    expect("startMirrorService" in canonicalMirrorService).toBe(true);
  });
});
