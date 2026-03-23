import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone sync entry surface", () => {
  it("keeps the canonical sync-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-sync/index.ts"), "utf8");

    expect(source).toContain("createMirrorSyncManager");
    expect(source).toContain("createMirrorSyncHandlers");
    expect(source).toContain("createMirrorSyncRouter");
    expect(source).toContain("executeMirrorSyncAction");
    expect(source).toContain("parseMirrorSyncAnnounceInput");
    expect(source).toContain("parseMirrorSyncPullInput");
    expect(source).toContain("parseMirrorSyncUpdatesInput");
    expect(source).toContain("wrapMirrorSyncPullResponse");
    expect(source).toContain('} from "./sync_manager.js";');
    expect(source).toContain(
      'export { createMirrorPeerRegistry, type MirrorPeerRegistry } from "./peer_registry.js";',
    );
    expect(source).toContain("collectLocalCanonUpdates");
    expect(source).toContain("applyRemoteCanonUpdates");
    expect(source).toContain('} from "./canon_sync.js";');
    expect(source).toContain("collectLocalGraphMetadata");
    expect(source).toContain("syncLocalGraphFromRemote");
    expect(source).toContain('} from "./graph_sync.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
