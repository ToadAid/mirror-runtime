# Mirror/Keeper Routing Specification

**Version**: 0.1.0
**Status**: Draft for PR#3-docs
**Scope**: Channel-level routing, output discipline, language handling

---

## Overview

The Mirror runtime supports two operational modes:

- **Mirror mode**: Public-facing, lore-focused, sanitized output
- **Keeper mode**: Private, ops-focused, verbose output

Routing determines which mode activates based on incoming messages.

---

## Trigger Patterns

### Mirror Route Trigger

| Pattern        | Example                                  | Description                      |
| -------------- | ---------------------------------------- | -------------------------------- |
| Prefix         | `Mirror, What does Toadgod say about X?` | Explicit prefix                  |
| Channel tag    | `#mirror What is the meaning of $TOBY?`  | Channel-specific routing         |
| Default public | `/ask` command                           | Auto-route if no prefix detected |

**Implementation**: `src/plugin-sdk/mirror/routing.ts` (to be created in Phase 1)

---

### Keeper Route Trigger

| Pattern         | Example                      | Description                   |
| --------------- | ---------------------------- | ----------------------------- |
| Prefix          | `Keeper, check the database` | Explicit prefix               |
| Private channel | DM / encrypted channel       | Auto-route to private context |

**Implementation**: Same routing module; Keeper takes precedence if triggered.

---

## Output Discipline

### Mirror Output

- **Content**: Only the final answer. No meta/debug fields.
- **Format**: Plain text or markdown, sanitized for public consumption.
- **Tone**: Calm, precise, lore-focused. No technical jargon.
- **Examples**:
  ```
  Mirror, who is Toadgod?
  → Toadgod is the first poet of Tobyworld. Through encrypted verses, they revealed $TOBY as a covenant of patience and community.
  ```

### Keeper Output

- **Content**: May include ops info, file paths, debug logs.
- **Format**: Structured, potentially with technical markup.
- **Tone**: Direct, operational, no fluff.
- **Examples**:
  ```
  Keeper, check the database
  → [System] Reading lore-scrolls from /path/to/lore-scrolls
  → [Match] Found 6 matching scrolls
  → [Ready] Awaiting further command
  ```

---

## Sanitization

### Mirror Sanitization

- **Remove**: `meta`, `debug`, `timestamp`, `source_ref` fields
- **Keep**: `answer`, `symbols` (if any), `citation` (optional)
- **Strip**: Tool context, execution logs, API error details

### Keeper Sanitization

- **None**: Full output allowed.
- **Redaction**: May redact sensitive tokens/keys if needed.

---

## Language Handling

### Auto-Detect

- **Method**: Simple regex or language detection library.
- **Languages**: English (`en`), Chinese (`zh`) (expandable).
- **Fallback**: English by default.

### Override

- **Pattern**: `#en` or `#zh` as prefix or channel tag.
- **Example**: `#zh Mirror, what is the prophecy?`

### Output Language

- Mirror must respond in the detected language.
- Override takes precedence.

---

## Channel-Specific Behavior

### Telegram

- **Commands**: `/ask <question>` or `@mirror <question>`
- **Mention**: `@mirror` triggers Mirror route (public).
- **Direct Message**: Auto-detects Mirror vs Keeper (no prefix needed in DM).

### Web

- **Endpoint**: `/ask` (GET or POST)
- **Query**: `?q=What%20is%20$TOBY?`
- **Response**: JSON with `answer` field only.

### WhatsApp

- **Command**: `/mirror <question>`
- **Reply**: Bot responds in same language as input.

### Discord

- **Commands**: `.mirror`, `/ask`, `#mirror` channel
- **Slash Commands**: `/ask` for Mirror route.

---

## Implementation Notes

### Routing Module Location

- **File**: `src/plugin-sdk/mirror/routing.ts`
- **Exports**: `detectMode(message: string): 'mirror' | 'keeper'`
- **Dependencies**: None (core utilities only)

### Feature Flags

| Flag                 | Default | Description                          |
| -------------------- | ------- | ------------------------------------ |
| `MIRROR_MODE_AUTO`   | `1`     | Enable auto-detection (default)      |
| `MIRROR_MODE_KEEPER` | `0`     | Force Keeper mode for all messages   |
| `MIRROR_SANITIZE`    | `1`     | Enable output sanitization (default) |

### Testing

- Unit tests for mode detection.
- Integration tests for channel-specific behavior.
- Regression tests for sanitization edge cases.

---

## Future Considerations

- **User Preferences**: Allow users to toggle Mirror/Keeper in settings.
- **Context Awareness**: Route based on channel trust level.
- **Multi-Agent Routing**: Delegate to specialized sub-agents (Keeper for ops, Mirror for lore).

---

## Related Documentation

- [Runtime Roadmap](./RUNTIME_ROADMAP.md) — Phased implementation plan
- [RAG Module Spec](./RAG_MODULE_SPEC.md) — Retrieval-augmented generation (Phase 3)
- [Mirror Boundary](./MIRROR_BOUNDARY.md) — Boundary overlay (PR#1)

---

**Status**: Draft for PR#3-docs
**Next Step**: Create PR#3 with this spec and Phase 0–4 roadmap
