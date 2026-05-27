import { VariableEngine } from "@/engine/variableEngine";
import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import { applyContextBudget } from "@/orchestrator/contextBudget";
import { serializeVariableSnapshot } from "@/orchestrator/contextSerializer";
import { renderMustacheTemplate } from "@/orchestrator/mustacheTemplate";
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
  WorldInfoSearchResult,
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
  mustacheVariables?: Record<string, string | number | boolean | null>;
}

interface SelectedWorldInfo {
  constantEntries: WorldInfoEntry[];
  matchedEntries: WorldInfoEntry[];
  traces: ContextInjectionTrace[];
}

let nextContextVersion = 1;

export function createDefaultContextBudget(): ContextBudget {
  return {
    maxTotalTokens: 6000,
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
  if (
    message.kind === "battle_summary" &&
    message.summary_level !== "minimal"
  ) {
    return false;
  }

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
): ChatMessage[] {
  return sortMessagesByCreatedAt(
    messages.filter((message) => isAiVisibleFinalized(message)),
  );
}

function renderHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "无可见历史。";
  }

  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function applyWorldInfoBudget(
  searchResult: WorldInfoSearchResult,
): SelectedWorldInfo {
  return {
    constantEntries: searchResult.constantEntries,
    matchedEntries: searchResult.matchedEntries,
    traces: searchResult.traces,
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

  const [messages, variableState] = await Promise.all([
    input.chatRepository.list(),
    getCurrentVariables(input.variableRepository),
  ]);
  await syncPlayerGenderWorldInfoActivation({
    variableRepository: input.variableRepository,
    worldInfoRepository: input.worldInfoRepository,
    variableState,
  });

  const historyMessages = selectHistory(messages);
  const searchableText = `${input.userInput}\n${historyMessages
    .map((message) => message.content)
    .join("\n")}`;
  const selectedWorldInfo = applyWorldInfoBudget(
    await input.worldInfoRepository.search(searchableText),
  );
  const tools = createToolDefinitions();
  const renderedSystemPrompt = renderMustacheTemplate(
    input.systemPrompt,
    variableState,
    input.mustacheVariables,
  ).text;

  const segments = [
    segment({
      id: "system",
      kind: "system",
      title: "System Prompt",
      content: renderedSystemPrompt,
      source: "systemPrompt",
    }),
    segment({
      id: "constant_world_info",
      kind: "world_info",
      title: "Constant World Info",
      content: renderWorldInfo(selectedWorldInfo.constantEntries),
      source: "worldInfoRepository",
    }),
    segment({
      id: "matched_world_info",
      kind: "world_info",
      title: "Matched World Info",
      content: renderWorldInfo(selectedWorldInfo.matchedEntries),
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
      [
        [
          "constant_world_info",
          Math.max(
            0,
            ...selectedWorldInfo.constantEntries.map((entry) => entry.priority),
          ),
        ],
        [
          "matched_world_info",
          Math.max(
            0,
            ...selectedWorldInfo.matchedEntries.map((entry) => entry.priority),
          ),
        ],
      ],
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
