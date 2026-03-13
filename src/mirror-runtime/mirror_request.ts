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
  session?: {
    session_id?: string;
    user_id?: string;
    tool_context?: Record<string, unknown>;
  };
};
