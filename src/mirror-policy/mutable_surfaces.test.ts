import { describe, expect, it } from "vitest";
import {
  isMirrorLocalOnlySurface,
  isMirrorMutableActionName,
  isMirrorNetworkExposedSurface,
} from "./mutable_surfaces.js";

describe("mirror mutable surface helpers", () => {
  it("treats cli as the only local-only surface", () => {
    expect(isMirrorLocalOnlySurface("cli")).toBe(true);
    expect(isMirrorLocalOnlySurface("service")).toBe(false);
    expect(isMirrorLocalOnlySurface("console")).toBe(false);
    expect(isMirrorLocalOnlySurface("sync")).toBe(false);
    expect(isMirrorLocalOnlySurface("adapter")).toBe(false);
  });

  it("treats service, console, sync, and adapter as network-exposed", () => {
    expect(isMirrorNetworkExposedSurface("service")).toBe(true);
    expect(isMirrorNetworkExposedSurface("console")).toBe(true);
    expect(isMirrorNetworkExposedSurface("sync")).toBe(true);
    expect(isMirrorNetworkExposedSurface("adapter")).toBe(true);
    expect(isMirrorNetworkExposedSurface("cli")).toBe(false);
    expect(isMirrorNetworkExposedSurface("gateway")).toBe(false);
  });

  it("classifies mutable and read-only actions from the explicit table", () => {
    expect(isMirrorMutableActionName("sync.pull")).toBe(true);
    expect(isMirrorMutableActionName("mirror.task.create")).toBe(true);
    expect(isMirrorMutableActionName("mirror.reminder.update")).toBe(true);
    expect(isMirrorMutableActionName("mirror.heartbeat.record-seen")).toBe(true);
    expect(isMirrorMutableActionName("mirror.monk.note")).toBe(true);

    expect(isMirrorMutableActionName("sync.updates")).toBe(false);
    expect(isMirrorMutableActionName("sync.peers")).toBe(false);
    expect(isMirrorMutableActionName("mirror.task.list")).toBe(false);
    expect(isMirrorMutableActionName("mirror.reminder.due")).toBe(false);
    expect(isMirrorMutableActionName("mirror.heartbeat.get")).toBe(false);
    expect(isMirrorMutableActionName("mirror.monk.context")).toBe(false);
  });
});
