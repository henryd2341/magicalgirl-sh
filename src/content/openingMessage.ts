import { renderMustacheTemplate } from "@/orchestrator/mustacheTemplate";
import type { ChatMessage } from "@/types/chat";
import openingMessageRawMale from "./开场白0.txt?raw";
import openingMessageRawFemale from "./开场白1.txt?raw";

export interface OpeningMessageInput {
  playerName: string;
  playerGender: string;
  now?: string;
}

export function renderOpeningMessage(input: OpeningMessageInput): ChatMessage {
  let openingMessageRaw;
  if (input.playerGender === "男") {
    openingMessageRaw = openingMessageRawMale;
  } else {
    openingMessageRaw = openingMessageRawFemale;
  }
  const result = renderMustacheTemplate(openingMessageRaw, undefined, {
    user: input.playerName,
  });

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
