import { orchestratePondLoreQuery } from "./orchestrate.js";
import { synthesizePondResult } from "./synthesize.js";

export type ConsultPondParams = {
  to: string;
  message: string;
  from?: string;
};

export type ConsultPondResult = {
  ok: boolean;
  target: string | null;
  trace_id: string;
  status: "completed" | "awaiting-response" | "dispatch-failed" | "target-missing";
  final_text: string;
  sources: string[];
};

export async function consultPond(params: ConsultPondParams): Promise<ConsultPondResult> {
  const orchestration = await orchestratePondLoreQuery({
    from: params.from ?? "agent0",
    to: params.to,
    message: params.message,
  });

  const synthesis = synthesizePondResult(orchestration);

  return {
    ok: synthesis.status === "completed",
    target: synthesis.target,
    trace_id: synthesis.trace_id,
    status: synthesis.status,
    final_text: synthesis.final_text,
    sources: synthesis.sources,
  };
}
