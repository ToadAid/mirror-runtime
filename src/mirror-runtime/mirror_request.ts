export type MirrorChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type MirrorChatRequest = {
  model: string;
  messages: MirrorChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  user_id?: string;
  provider?: {
    provider_id?: string;
    allow_fallback?: boolean;
  };
  session?: {
    session_id?: string;
    user_id?: string;
    tool_context?: Record<string, unknown>;
  };
  correlation?: {
    trace_id?: string;
    session_id?: string;
    action_id?: string;
    provider_id?: string;
  };
};
