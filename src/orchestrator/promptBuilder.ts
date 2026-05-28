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
      description: [
        "Apply one or more variable patches to change game state.",
        "Each patch has a \"path\" (where to write) and a \"value\" (what to write).",
        "",
        "=== Writable paths ===",
        "",
        "-- Basic profile (name/age/gender NOT visible in state snapshot) --",
        "  player.profile.name        string            e.g. \"鹿目真昼\"",
        "  player.profile.age         integer           e.g. 16",
        "  player.profile.gender      \"男\" | \"女\"       e.g. \"女\"",
        "  player.money               number (>=0)      e.g. 150  — visible in snapshot",
        "",
        "-- World (only displayText & name visible in state snapshot) --",
        "  world.time.displayText     string            e.g. \"9月16日 周三 下午\"",
        "  world.time.dayIndex        integer           e.g. 2",
        "  world.time.timeSlot        string            e.g. \"下午\"",
        "  world.location.id          string            e.g. \"school_rooftop\"",
        "  world.location.name        string            e.g. \"天台\"",
        "  world.location.description string            e.g. \"午后的天台空无一人，风很大。\"",
        "",
        "-- Flags (NOT visible in snapshot; use as narrative markers) --",
        "  world.flags.<flag_name>     boolean           e.g. world.flags.storm_warning = true",
        "  player.flags.<flag_name>    boolean           e.g. player.flags.isNewTransfer = false",
        "",
        "-- Relationships (NOT visible in snapshot; range 0-100) --",
        "  player.relationships.<id>   integer (0-100)   e.g. player.relationships[\"佐仓真央\"] = 60",
        "",
        "-- Inventory (items visible in snapshot; battleItems NOT visible) --",
        "  inventory.items.<item_id>        positive integer  e.g. inventory.items.potion = 3",
        "  inventory.battleItems.<item_id>  positive integer  must NOT exceed inventory.items.<item_id>",
        "",
        "=== Read-only (visible in state snapshot, do NOT patch) ===",
        "  combat.level, combat.hp (current/max), combat.mp (current/max), combat.attack,",
        "  combat.defense, combat.agility, combat.intelligence — managed by battle engine",
        "",
        "=== Hidden (not visible, not writable) ===",
        "  equipment, affairs, characters — managed by engine only",
        "",
        "Input: { \"patches\": [{ \"path\": \"...\", \"value\": ... }] }",
        "Example: { \"patches\": [{ \"path\": \"player.money\", \"value\": 200 }, { \"path\": \"player.flags.helped_cat\", \"value\": true }] }",
      ].join("\n"),
      envelopeFields: ENVELOPE_FIELDS,
    },
    {
      name: "trigger_battle",
      description: [
        "Initiate a combat encounter. Places the game into pending battle state.",
        "",
        "Fields:",
        "  encounter_id (string) — Unique identifier for this encounter, e.g. \"encounter_rooftop_shade\"",
        "  enemies (array) — [{ \"enemy_id\": string, \"count\": integer >=1 }]",
        "    enemy_id: enemy type identifier",
        "    count: how many of this type",
        "  modifiers (string[], optional) — Battle conditions, e.g. [\"ambush\", \"midnight\", \"first_battle\"]",
        "  narrative_reason (string) — Why this battle is happening in the story",
        "",
        "Example:",
        "  { \"encounter_id\": \"encounter_classroom_shade\", \"enemies\": [{ \"enemy_id\": \"shade_student\", \"count\": 1 }], \"modifiers\": [\"first_battle\"], \"narrative_reason\": \"一只暗影生物从虫洞出现，袭击了教室\" }",
      ].join("\n"),
      envelopeFields: ENVELOPE_FIELDS,
    },
  ];
}

function renderEnvelopeGuide(): string {
  return [
    "=== Tool Call Envelope Guide ===",
    "Every tool call must include these fields:",
    "  request_id      — Copy from Harness Request metadata. Do not invent.",
    "  context_version — Copy from Harness Request metadata.",
    "  state_hash      — Copy from the Game State Snapshot. Must match exactly or the call is rejected.",
    "  tool_call_id    — Generate a unique id. Format: call-<description>-<suffix>",
    "  tool_name       — One of the available tool names. Must match exactly.",
    "  input           — Tool-specific input object. See each tool's description for schema.",
    "  issued_at       — ISO 8601 timestamp. Optional.",
  ].join("\n");
}

function renderToolDefinitions(tools: ProviderToolDefinition[]): string {
  const sections = tools.map(
    (tool) =>
      [
        `tool: ${tool.name}`,
        `description: ${tool.description}`,
        `envelope: ${tool.envelopeFields.join(", ")}`,
      ].join("\n"),
  );

  return [...sections, renderEnvelopeGuide()].join("\n\n");
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
