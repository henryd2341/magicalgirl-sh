export type ChatMessageRole = "user" | "assistant" | "system";
export type ChatMessageKind = "normal" | "battle_summary" | "failed_draft";
export type ChatBattleSummaryLevel = "verbose" | "default" | "minimal";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  kind: ChatMessageKind;
  summary_level?: ChatBattleSummaryLevel;
  content: string;
  reasoning?: string;
  user_visible: boolean;
  ai_visible: boolean;
  provisional: boolean;
  finalized: boolean;
  failed: boolean;
  request_id?: string;
  context_version?: number;
  tool_call_id?: string;
  created_at: string;
}
