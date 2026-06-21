import type { ProviderClient } from "@/orchestrator/providerClient";
import type { ProviderMessage } from "@/orchestrator/harnessContextTypes";

export interface ConversationSummarizerDeps {
  providerClient: ProviderClient;
}

export interface SummarizeInput {
  messages: ProviderMessage[];
  previousSummary?: string;
}

const SUMMARIZE_SYSTEM_PROMPT = [
  "You are a narrative summarizer for a magical-girl RPG game session.",
  "Summarize the conversation below into a concise paragraph (max 200 words) that preserves:",
  "- Key character actions, decisions, and emotional beats",
  "- Location changes and scene transitions",
  "- Important revelations or discoveries",
  "- Active plot threads and unresolved conflicts",
  "- Any variable changes mentioned (money, flags, relationships, inventory)",
  "",
  "Write in past tense. Be specific with names and places. Omit greetings and filler.",
  "If a previous summary is provided, merge it with the new events — the result should be a single progressive summary.",
].join("\n");

const MAX_SUMMARY_WORDS = 280;

function generateRequestId(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === "function") {
    return `summary-${crypto.randomUUID()}`;
  }
  return `summary-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function truncateAtWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text;
  }

  const truncated = words.slice(0, maxWords).join(" ");

  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf("。"),
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
  );

  if (lastSentenceEnd > maxWords * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  return `${truncated}…`;
}

export class ConversationSummarizer {
  private readonly providerClient: ProviderClient;

  public constructor(deps: ConversationSummarizerDeps) {
    this.providerClient = deps.providerClient;
  }

  public async summarize(input: SummarizeInput): Promise<string> {
    const systemMessages: ProviderMessage[] = [
      { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
    ];

    if (input.previousSummary) {
      systemMessages.push({
        role: "system",
        content: `Previous summary (merge with new events below):\n${input.previousSummary}`,
      });
    }

    const userPrompt = [
      "Summarize the following conversation segment. Return ONLY the summary paragraph, no preamble.",
      "",
      "--- CONVERSATION ---",
      ...input.messages.map((m) => `[${m.role}]: ${m.content}`),
      "--- END ---",
    ].join("\n");

    const allMessages: ProviderMessage[] = [
      ...systemMessages,
      { role: "user", content: userPrompt },
    ];

    // Build a minimal request for the summarization call.
    // No tools, no multi-step — just a single completion.
    const minimalRequest = {
      metadata: {
        request_id: generateRequestId(),
        context_version: 0,
        state_hash: "summary",
        issued_at: new Date().toISOString(),
      },
      segments: [],
      traces: [],
      messages: allMessages,
      tools: [],
      promptText: allMessages.map((m) => m.content).join("\n\n"),
    };

    let summary = "";

    await this.providerClient.stream(minimalRequest, {
      onTextChunk: async (chunk) => {
        summary += chunk;
      },
      onReasoningChunk: async (_chunk) => {
        // Discard reasoning/thinking chunks — they must not pollute the summary.
      },
    });

    const trimmed = summary.trim();
    return truncateAtWordLimit(trimmed, MAX_SUMMARY_WORDS);
  }
}
