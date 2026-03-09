import type { PondAgent } from "./types.js";

let pondAgents: PondAgent[] = [];

export function setPondAgents(list: PondAgent[]): void {
  pondAgents = [...list];
}

export function getPondAgents(): PondAgent[] {
  return [...pondAgents];
}
