import openingMessageRaw from "../../raw_entries/开场白.txt?raw";
import { renderMustacheTemplate } from "@/orchestrator/mustacheTemplate";
import type { ChatMessage } from "@/types/chat";

export interface OpeningMessageInput {
  playerName: string;
  now?: string;
}

export function renderOpeningMessage(input: OpeningMessageInput): ChatMessage {
  const result = renderMustacheTemplate(
    openingMessageRaw,
    undefined,
    { user: input.playerName },
  );

  return {
    id: "msg-opening-ceremony",
    role: "assistant",
    kind: "normal",
    content: result.text,
    user_visible: true,
    ai_visible: true,
    provisional: false,
    finalized: true,
    failed: false,
    created_at: input.now ?? new Date().toISOString(),
  };
}
