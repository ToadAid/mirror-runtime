/**
 * @fileoverview Local Test Harness for Lore Forge
 * @description Standalone script to test lore_forge library functions.
 */

import {
  scoreCandidate,
  scoreCandidates,
  createJsonBundle,
  createJsonlBundle,
  createMarkdownBundle,
} from "../src/plugin-sdk/mirror/lore_forge/index";

const testCandidates = [
  {
    id: "test-1",
    content: "This is a test lore candidate",
    tags: ["test", "example"],
  },
  {
    id: "test-2",
    content: "Another test candidate with more tags",
    tags: ["test", "example", "demo"],
  },
  {
    id: "test-3",
    content: "A candidate with no tags",
    tags: [],
  },
];

console.log("=== Lore Forge Test Harness ===\n");

// Test 1: Basic scoring
console.log("Test 1: Score single candidate");
const scored1 = scoreCandidate(testCandidates[0], { includeReason: true });
console.log(JSON.stringify(scored1, null, 2), "\n");

// Test 2: Batch scoring
console.log("Test 2: Score batch of candidates");
const scoredBatch = scoreCandidates(testCandidates, { includeReason: true });
console.log(JSON.stringify(scoredBatch, null, 2), "\n");

// Test 3: JSON bundle
console.log("Test 3: Create JSON bundle");
const jsonBundle = createJsonBundle(scoredBatch, { format: "json" });
console.log(jsonBundle, "\n");

// Test 4: JSONL bundle
console.log("Test 4: Create JSONL bundle");
const jsonlBundle = createJsonlBundle(scoredBatch, { format: "jsonl" });
console.log(jsonlBundle, "\n");

// Test 5: Markdown bundle
console.log("Test 5: Create markdown bundle");
const mdBundle = createMarkdownBundle(scoredBatch, { format: "markdown" });
console.log(mdBundle, "\n");

console.log("=== All Tests Complete ===");
