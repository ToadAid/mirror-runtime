export type PondDispatchRequest = {
  from: string;
  to: string;
  type: "lore_query";
  message: string;
  trace_id: string;
};

export type PondDispatchResponse = {
  from: string;
  to: string;
  type: "lore_response";
  trace_id: string;
  signal: string;
  reflection: string;
  sources: string[];
};

export function createTraceId(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[-:.TZ]/g, "");
  const rand = Math.random().toString(16).slice(2, 10);
  return `pond_${ts}_${rand}`;
}
