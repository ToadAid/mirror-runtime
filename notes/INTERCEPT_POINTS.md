# Response Interception Candidates

We need to hook into the engine where agent responses (specifically messages) are finalized before delivery.

## Candidate 1: `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- **Why:** Handles tool execution lifecycle (`handleToolExecutionUpdate`).
- **Logic:** `isMessagingToolSendAction` checks if a tool call is a message.
- **Hook Opportunity:** Inject `cadenceGuard.check()` before `commitMessagingToolText`.

## Candidate 2: `src/agents/channel-tools.ts`
- **Why:** Defines channel capabilities.
- **Status:** Less likely for interception; more for discovery.

## Candidate 3: `src/agents/pi-embedded-messaging.ts`
- **Why:** Helper functions like `isMessagingTool`.
- **Status:** Utility only.

## Action Plan
Investigate `pi-embedded-subscribe.handlers.tools.ts` primarily. Look for the point where `ctx.state.messagingToolSentTexts` is populated.
