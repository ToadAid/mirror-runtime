import type { PondOrchestrationResult } from "./orchestrate.js";

export type PondSynthesisResult = {
  mode: "pond-synthesized";
  target: string | null;
  trace_id: string;
  final_text: string;
  sources: string[];
  status: "completed" | "awaiting-response" | "dispatch-failed" | "target-missing";
};

export function synthesizePondResult(result: PondOrchestrationResult): PondSynthesisResult {
  if (result.status === "completed" && result.response) {
    return {
      mode: "pond-synthesized",
      target: result.request.to,
      trace_id: result.request.trace_id,
      final_text: `Signal\n${result.response.signal}\n\nReflection\n${result.response.reflection}`,
      sources: result.response.sources ?? [],
      status: "completed",
    };
  }

  if (result.status === "awaiting-response") {
    return {
      mode: "pond-synthesized",
      target: result.request.to,
      trace_id: result.request.trace_id,
      final_text: "The pond has received the question, but no Cave Scribe reply has arrived yet.",
      sources: [],
      status: "awaiting-response",
    };
  }

  if (result.status === "dispatch-failed") {
    return {
      mode: "pond-synthesized",
      target: result.request.to,
      trace_id: result.request.trace_id,
      final_text: "The pond could not deliver the query to the target Cave Scribe.",
      sources: [],
      status: "dispatch-failed",
    };
  }

  return {
    mode: "pond-synthesized",
    target: null,
    trace_id: result.request.trace_id,
    final_text: "The requested Cave Scribe could not be found in the pond.",
    sources: [],
    status: "target-missing",
  };
}
