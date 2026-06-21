import type { ChatMessage } from "@/types/chat";
import type { ProviderClient } from "@/orchestrator/providerClient";
import type { ProviderSettingsState } from "@/orchestrator/providerSettings";
import { ConversationSummarizer } from "@/engine/conversationSummarizer";
import { estimateTokens } from "@/engine/summary/tokenEstimator";

export interface HistorySummarizerChatRepository {
  list(): Promise<ChatMessage[]>;
  save(message: ChatMessage): Promise<void>;
  getById(id: string): Promise<ChatMessage | null>;
}

export interface HistorySummarizerSettingsRepository {
  getState(): Promise<ProviderSettingsState>;
}

export interface HistorySummarizerProviderClientFactory {
  (): Promise<ProviderClient>;
}

export interface CreateContextSummaryMessageInput {
  id: string;
  content: string;
  createdAt: string;
}

export interface HistorySummarizerDeps {
  chatRepository: HistorySummarizerChatRepository;
  createSummaryMessage: (
    input: CreateContextSummaryMessageInput,
  ) => Promise<ChatMessage>;
  settingsRepo: HistorySummarizerSettingsRepository;
  providerClientFactory: HistorySummarizerProviderClientFactory;
}

export interface HistorySummarizerOptions {
  now?: () => string;
  idFactory?: () => string;
}

let summarizationInFlight = false;

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultIdFactory(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `summary-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function selectVisibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (m) => m.ai_visible && m.finalized && m.kind !== "context_summary",
  );
}

function selectLatestPreviousSummary(
  messages: ChatMessage[],
): ChatMessage | undefined {
  return messages
    .filter((m) => m.kind === "context_summary" && m.finalized && m.ai_visible)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
}

function selectActiveContextSummaries(
  messages: ChatMessage[],
): ChatMessage[] {
  return messages.filter(
    (m) => m.kind === "context_summary" && m.ai_visible,
  );
}

function splitByCumulativeTokens(
  visibleMessages: ChatMessage[],
  targetTokens: number,
): ChatMessage[] {
  let acc = 0;
  let splitIndex = 0;
  for (let i = 0; i < visibleMessages.length; i++) {
    if (acc >= targetTokens) break;
    acc += estimateTokens(visibleMessages[i].content);
    splitIndex = i + 1;
  }
  return visibleMessages.slice(0, splitIndex);
}

export async function maybeSummarizeHistory(
  deps: HistorySummarizerDeps,
  options: HistorySummarizerOptions = {},
): Promise<void> {
  if (summarizationInFlight) {
    return;
  }
  summarizationInFlight = true;

  try {
    const now = options.now ?? defaultNow;
    const idFactory = options.idFactory ?? defaultIdFactory;

    const messages = await deps.chatRepository.list();
    const visibleMessages = selectVisibleMessages(messages);

    const settings = await deps.settingsRepo.getState();

    if (!settings.summaryEnabled) {
      return;
    }

    const estimatedTokens = visibleMessages.reduce(
      (total, m) => total + estimateTokens(m.content),
      0,
    );

    if (estimatedTokens < settings.summaryTokenThreshold) {
      return;
    }

    const targetTokens = Math.floor(
      estimatedTokens * settings.summaryOldRatio,
    );
    const oldMessages = splitByCumulativeTokens(visibleMessages, targetTokens);

    if (oldMessages.length < 3) {
      return;
    }

    const previousSummary = selectLatestPreviousSummary(messages);

    const providerClient = await deps.providerClientFactory();
    const summarizer = new ConversationSummarizer({ providerClient });

    const providerMessages = oldMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const summary = await summarizer.summarize({
      messages: providerMessages,
      previousSummary: previousSummary?.content,
    });

    if (!summary) {
      return;
    }

    const idsToInvalidate = [
      ...oldMessages.map((m) => m.id),
      ...selectActiveContextSummaries(messages).map((m) => m.id),
    ];

    for (const id of idsToInvalidate) {
      const msg = await deps.chatRepository.getById(id);
      if (!msg) continue;
      await deps.chatRepository.save({ ...msg, ai_visible: false });
    }

    await deps.createSummaryMessage({
      id: idFactory(),
      content: summary,
      createdAt: now(),
    });
  } finally {
    summarizationInFlight = false;
  }
}

export function __resetSummarizationLock(): void {
  summarizationInFlight = false;
}
