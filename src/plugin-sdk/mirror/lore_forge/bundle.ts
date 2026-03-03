import type { LoreForgeScored } from "./scoring.js";

export function toJsonBundle(items: LoreForgeScored[]) {
  return items;
}

export function toJsonlBundle(items: LoreForgeScored[]) {
  return (items || []).map((x) => JSON.stringify(x)).join("\n");
}

export function toMarkdownBundle(items: LoreForgeScored[]) {
  // keep main’s implementation body below (whatever is already in main)
}
  const header = `# Lore Forge Bundle

Generated: ${new Date().toISOString()}

`;

const body = (items || [])
    .map((x, i) => {
      const content = x?.candidate?.content ?? "";
      const score = x?.score ?? 0;
      const reason = x?.reason ?? "";

      return `## Candidate ${i + 1}

Score: ${score}

Reason: ${reason}

${content}

---
`;
    })
    .join("\n");
    })
    .join("\n");

  return header + body;
}
