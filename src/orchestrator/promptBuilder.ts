import { VariableEngine } from "@/engine/variableEngine";
import { applyContextBudget } from "@/orchestrator/contextBudget";
import { serializeVariableSnapshot } from "@/orchestrator/contextSerializer";
import type {
  BuiltProviderRequest,
  ContextBudget,
  ContextInjectionTrace,
  EnvelopeField,
  PromptSegment,
  ProviderMessage,
  ProviderToolDefinition,
} from "@/orchestrator/harnessContextTypes";
import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type {
  WorldInfoEntry,
  WorldInfoRepository,
} from "@/persistence/repositories/worldInfoRepository";
import type { ChatMessage } from "@/types/chat";
import type { VariableValueRecord } from "@/types/variables";

export interface BuildHarnessRequestInput {
  chatRepository: ChatHistoryRepository;
  variableRepository: VariableRepository;
  worldInfoRepository: WorldInfoRepository;
  systemPrompt: string;
  userInput: string;
  requestId: string;
  contextVersion?: number;
  now: string;
  budget?: ContextBudget;
}

interface SelectedWorldInfo {
  entries: WorldInfoEntry[];
  traces: ContextInjectionTrace[];
}

let nextContextVersion = 1;

export function createDefaultContextBudget(): ContextBudget {
  return {
    maxTotalTokens: 6000,
    maxWorldInfoEntries: 4,
    maxHistoryMessages: 8,
  };
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function segment(input: Omit<PromptSegment, "tokenEstimate" | "included">): PromptSegment {
  return {
    ...input,
    tokenEstimate: estimateTokens(input.content),
    included: true,
  };
}

function isAiVisibleFinalized(message: ChatMessage): boolean {
  return (
    message.ai_visible &&
    message.finalized &&
    !message.provisional &&
    !message.failed
  );
}

function sortMessagesByCreatedAt(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
}

function selectHistory(
  messages: ChatMessage[],
  budget: ContextBudget,
): ChatMessage[] {
  const visibleMessages = sortMessagesByCreatedAt(
    messages.filter((message) => isAiVisibleFinalized(message)),
  );
  return visibleMessages.slice(-budget.maxHistoryMessages);
}

function renderHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "无可见历史。";
  }

  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function selectWorldInfoEntries(
  entries: WorldInfoEntry[],
  searchableText: string,
  budget: ContextBudget,
): SelectedWorldInfo {
  const traces: ContextInjectionTrace[] = [];
  const matched: WorldInfoEntry[] = [];

  for (const entry of entries) {
    if (!entry.enabled) {
      traces.push({
        sourceId: entry.id,
        kind: "world_info",
        included: false,
        reason: "disabled",
        priority: entry.priority,
      });
      continue;
    }

    const hasKeywordMatch = entry.keywords.some((keyword) =>
      searchableText.includes(keyword),
    );
    if (!hasKeywordMatch) {
      traces.push({
        sourceId: entry.id,
        kind: "world_info",
        included: false,
        reason: "keyword_miss",
        priority: entry.priority,
      });
      continue;
    }

    matched.push(entry);
  }

  const sorted = matched.sort((left, right) => right.priority - left.priority);
  const selected = sorted.slice(0, budget.maxWorldInfoEntries);
  const selectedIds = new Set(selected.map((entry) => entry.id));

  for (const entry of sorted) {
    traces.push({
      sourceId: entry.id,
      kind: "world_info",
      included: selectedIds.has(entry.id),
      reason: selectedIds.has(entry.id)
        ? "keyword_match"
        : "budget_world_info_count",
      priority: entry.priority,
      tokenEstimate: estimateTokens(entry.content),
    });
  }

  return {
    entries: selected,
    traces,
  };
}

function renderWorldInfo(entries: WorldInfoEntry[]): string {
  if (entries.length === 0) {
    return "无命中的 world_info。";
  }

  return entries
    .map((entry) => `[${entry.id}]\n${entry.content}`)
    .join("\n\n");
}

const ENVELOPE_FIELDS: EnvelopeField[] = [
  "request_id",
  "context_version",
  "state_hash",
  "tool_call_id",
  "tool_name",
  "input",
  "issued_at",
];

function createToolDefinitions(): ProviderToolDefinition[] {
  return [
    {
      name: "update_variables",
      description:
        "Apply whitelisted variable patches through the local Game Engine. The model cannot directly mutate state.",
      envelopeFields: ENVELOPE_FIELDS,
    },
    {
      name: "trigger_battle",
      description:
        "Request a story-mode battle using local enemy ids only. The local engine validates and resolves combat.",
      envelopeFields: ENVELOPE_FIELDS,
    },
  ];
}

function renderToolDefinitions(tools: ProviderToolDefinition[]): string {
  return tools
    .map(
      (tool) =>
        [
          `tool: ${tool.name}`,
          `description: ${tool.description}`,
          `envelope: ${tool.envelopeFields.join(", ")}`,
        ].join("\n"),
    )
    .join("\n\n");
}

function buildMessages(
  segments: PromptSegment[],
  historyMessages: ChatMessage[],
): ProviderMessage[] {
  const systemMessages: ProviderMessage[] = segments
    .filter((item) => item.included && item.kind !== "history")
    .map((item) => ({ role: "system" as const, content: item.content }));

  const historyProviderMessages: ProviderMessage[] = historyMessages.map(
    (message) => ({ role: message.role, content: message.content }),
  );

  return [...systemMessages, ...historyProviderMessages];
}

function joinPromptText(segments: PromptSegment[]): string {
  return segments
    .filter((item) => item.included)
    .map((item) => `## ${item.title}\n${item.content}`)
    .join("\n\n");
}

async function getCurrentVariables(
  repository: VariableRepository,
): Promise<VariableValueRecord> {
  const current = await repository.getCurrent();
  if (current) {
    return current;
  }

  return new VariableEngine().createInitialState();
}

export async function buildHarnessRequest(
  input: BuildHarnessRequestInput,
): Promise<BuiltProviderRequest> {
  const budget = input.budget ?? createDefaultContextBudget();
  const contextVersion = input.contextVersion ?? nextContextVersion;
  if (input.contextVersion === undefined) {
    nextContextVersion += 1;
  }

  const [messages, variableState, worldInfoEntries] = await Promise.all([
    input.chatRepository.list(),
    getCurrentVariables(input.variableRepository),
    input.worldInfoRepository.list(),
  ]);

  const historyMessages = selectHistory(messages, budget);
  const searchableText = `${input.userInput}\n${historyMessages
    .map((message) => message.content)
    .join("\n")}`;
  const selectedWorldInfo = selectWorldInfoEntries(
    worldInfoEntries,
    searchableText,
    budget,
  );
  const tools = createToolDefinitions();

  const segments = [
    segment({
      id: "system",
      kind: "system",
      title: "System Prompt",
      content: input.systemPrompt,
      source: "systemPrompt",
    }),
    segment({
      id: "world_info",
      kind: "world_info",
      title: "World Info",
      content: renderWorldInfo(selectedWorldInfo.entries),
      source: "worldInfoRepository",
    }),
    segment({
      id: "state",
      kind: "state",
      title: "Game State Snapshot",
      content: serializeVariableSnapshot(variableState),
      source: "variableRepository",
    }),
    segment({
      id: "tools",
      kind: "tools",
      title: "Available Tools",
      content: renderToolDefinitions(tools),
      source: "toolSchemas",
    }),
    segment({
      id: "history",
      kind: "history",
      title: "Conversation History",
      content: renderHistory(historyMessages),
      source: "chatHistoryRepository",
    }),
  ];

  const budgeted = applyContextBudget({
    segments,
    budget,
    worldInfoPriorities: new Map(
      selectedWorldInfo.entries.map((entry) => [
        entry.id,
        entry.priority,
      ]),
    ),
  });

  return {
    metadata: {
      request_id: input.requestId,
      context_version: contextVersion,
      state_hash: variableState.stateHash,
      issued_at: input.now,
    },
    segments: budgeted.segments,
    traces: [...selectedWorldInfo.traces, ...budgeted.traces],
    messages: buildMessages(budgeted.segments, historyMessages),
    tools,
    promptText: joinPromptText(budgeted.segments),
  };
}
