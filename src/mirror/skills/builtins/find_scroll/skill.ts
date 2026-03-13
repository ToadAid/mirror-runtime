import {
  findScroll,
  type FindScrollInput,
  type FindScrollResult,
} from "../../find_scroll/index.js";
import type { MirrorSkill } from "../../types.js";

function validateInput(input: Record<string, unknown>): FindScrollInput {
  const query = input.query;
  const userId = input.user_id;
  const limit = input.limit;

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new TypeError("mirror.find_scroll requires input.query");
  }
  if (userId !== undefined && typeof userId !== "string") {
    throw new TypeError("mirror.find_scroll input.user_id must be a string when provided");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new TypeError("mirror.find_scroll input.limit must be a positive integer when provided");
  }

  return {
    query,
    user_id: userId,
    limit: typeof limit === "number" ? limit : undefined,
  };
}

export async function runFindScroll(input: Record<string, unknown>): Promise<FindScrollResult> {
  return findScroll(validateInput(input));
}

export const mirrorFindScrollSkill: MirrorSkill = {
  meta: {
    name: "mirror.find_scroll",
    description: "Finds canon-first Tobyworld scroll candidates for a user query",
    version: "1.0.0",
    inputs: ["query", "user_id", "limit"],
    outputs: [
      "candidates",
      "matched_keywords",
      "matched_symbols",
      "canon_notes",
      "supersedes_topics",
    ],
  },
  async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return runFindScroll(input);
  },
};
