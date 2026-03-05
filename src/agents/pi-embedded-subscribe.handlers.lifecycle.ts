import { emitAgentEvent } from "../infra/agent-events.js";
import { createInlineCodeState } from "../markdown/code-spans.js";
import { consumeMirrorHints } from "../mirror/hints/consumer.js";
import { formatMirrorNudgeFooter } from "../mirror/hints/nudge_surface.js";
import { buildMirrorNudgeTelemetryEvent } from "../mirror/telemetry/mirror_telemetry.js";
import { writeTelemetryEventIfEnabled } from "../mirror/telemetry_sinks/runtime_sink.js";
import { formatAssistantErrorText } from "./pi-embedded-helpers.js";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";
import { isAssistantMessage } from "./pi-embedded-utils.js";

export {
  handleAutoCompactionEnd,
  handleAutoCompactionStart,
} from "./pi-embedded-subscribe.handlers.compaction.js";

type MirrorHint = {
  type: "mirror_hint";
  ts: number;
  runId?: string;
  toolName: string;
  signature: string;
  repeats: number;
  hint: string;
};

function drainMirrorHints(state: EmbeddedPiSubscribeContext["state"]): MirrorHint[] {
  const stateWithHints = state as EmbeddedPiSubscribeContext["state"] & {
    mirrorHints?: MirrorHint[];
  };
  const hints = Array.isArray(stateWithHints.mirrorHints) ? [...stateWithHints.mirrorHints] : [];
  stateWithHints.mirrorHints = [];
  return hints;
}

export function handleAgentStart(ctx: EmbeddedPiSubscribeContext) {
  ctx.log.debug(`embedded run agent start: runId=${ctx.params.runId}`);
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "lifecycle",
    data: {
      phase: "start",
      startedAt: Date.now(),
    },
  });
  void ctx.params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "start" },
  });
}

export function handleAgentEnd(ctx: EmbeddedPiSubscribeContext) {
  const lastAssistant = ctx.state.lastAssistant;
  const isError = isAssistantMessage(lastAssistant) && lastAssistant.stopReason === "error";

  if (isError && lastAssistant) {
    const friendlyError = formatAssistantErrorText(lastAssistant, {
      cfg: ctx.params.config,
      sessionKey: ctx.params.sessionKey,
      provider: lastAssistant.provider,
      model: lastAssistant.model,
    });
    const errorText = (friendlyError || lastAssistant.errorMessage || "LLM request failed.").trim();
    ctx.log.warn(
      `embedded run agent end: runId=${ctx.params.runId} isError=true error=${errorText}`,
    );
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: {
        phase: "error",
        error: errorText,
        endedAt: Date.now(),
      },
    });
    void ctx.params.onAgentEvent?.({
      stream: "lifecycle",
      data: {
        phase: "error",
        error: errorText,
      },
    });
  } else {
    ctx.log.debug(`embedded run agent end: runId=${ctx.params.runId} isError=${isError}`);
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: {
        phase: "end",
        endedAt: Date.now(),
      },
    });
    void ctx.params.onAgentEvent?.({
      stream: "lifecycle",
      data: { phase: "end" },
    });
  }

  ctx.flushBlockReplyBuffer();

  if (process.env.MIRROR_LEDGER_ENABLED === "1") {
    const hints = drainMirrorHints(ctx.state);
    if (hints.length > 0) {
      void ctx.params.onAgentEvent?.({
        stream: "mirror_hints",
        data: {
          runId: ctx.params.runId,
          hints,
        },
      });
      if (process.env.MIRROR_HINTS_ENABLED === "1") {
        const { nudges } = consumeMirrorHints({
          runId: ctx.params.runId,
          hints,
          log: ctx.log,
          onAgentEvent: ctx.params.onAgentEvent,
        });
        if (nudges.length > 0) {
          ctx.log.warn(`[mirror_nudge] runId=${ctx.params.runId} nudges=${nudges.length}`);
          void ctx.params.onAgentEvent?.({
            stream: "mirror_nudge",
            data: {
              runId: ctx.params.runId,
              nudges,
            },
          });
          if (process.env.MIRROR_TELEMETRY_ENABLED === "1") {
            const telemetry = buildMirrorNudgeTelemetryEvent({
              runId: ctx.params.runId,
              nudges,
            });
            if (telemetry.nudges.length > 0) {
              const telemetryEvent = {
                stream: "telemetry" as const,
                data: telemetry as unknown as Record<string, unknown>,
              };
              writeTelemetryEventIfEnabled(telemetryEvent);
              void ctx.params.onAgentEvent?.(telemetryEvent);
            }
          }
          if (process.env.MIRROR_NUDGE_FOOTER === "1") {
            const footer = formatMirrorNudgeFooter(nudges);
            if (footer) {
              const stateWithFooter = ctx.state as EmbeddedPiSubscribeContext["state"] & {
                mirrorNudgeFooter?: string;
                assistantTexts?: string[];
              };
              stateWithFooter.mirrorNudgeFooter = footer;
              if (Array.isArray(stateWithFooter.assistantTexts)) {
                stateWithFooter.assistantTexts.push(footer);
              }
            }
          }
        }
      }
    }
  }

  ctx.state.blockState.thinking = false;
  ctx.state.blockState.final = false;
  ctx.state.blockState.inlineCode = createInlineCodeState();

  if (ctx.state.pendingCompactionRetry > 0) {
    ctx.resolveCompactionRetry();
  } else {
    ctx.maybeResolveCompactionWait();
  }
}
