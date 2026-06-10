import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import { VariableEngine } from "@/engine/variableEngine";
import { applyContextBudget } from "@/orchestrator/contextBudget";
import { serializeVariableStateToYaml } from "@/orchestrator/contextSerializer";
import { renderMustacheTemplate } from "@/orchestrator/mustacheTemplate";
// import {
//   getWritablePaths,
//   getReadOnlyPaths,
// } from "@/orchestrator/schemaReader";
import type {
  BuiltProviderRequest,
  ContextBudget,
  ContextInjectionTrace,
  PromptSegment,
  ProviderMessage,
  ProviderToolDefinition,
} from "@/orchestrator/harnessContextTypes";
import type { SkillMetadata } from "@/orchestrator/skillRegistry";
import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type {
  WorldInfoEntry,
  WorldInfoRepository,
  WorldInfoSearchResult,
} from "@/persistence/repositories/worldInfoRepository";
import type { ChatMessage } from "@/types/chat";
import type { PreviousValueMap, VariableValueRecord } from "@/types/variables";

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
  skillMetadata?: SkillMetadata[];
  previousValues?: PreviousValueMap;
}

interface SelectedWorldInfo {
  constantEntries: WorldInfoEntry[];
  matchedEntries: WorldInfoEntry[];
  traces: ContextInjectionTrace[];
}

let nextContextVersion = 1;

export function createDefaultContextBudget(): ContextBudget {
  return {
    maxTotalTokens: 100000,
  };
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function segment(
  input: Omit<PromptSegment, "tokenEstimate" | "included">,
): PromptSegment {
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

function selectHistory(messages: ChatMessage[]): ChatMessage[] {
  return sortMessagesByCreatedAt(
    messages.filter(
      (message) =>
        isAiVisibleFinalized(message) && message.kind !== "context_summary",
    ),
  );
}

function selectConversationSummaries(messages: ChatMessage[]): ChatMessage[] {
  return sortMessagesByCreatedAt(
    messages.filter(
      (message) => message.kind === "context_summary" && message.finalized,
    ),
  );
}

function renderConversationSummary(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "";
  }
  // Only use the most recent summary for progressive merging
  const latest = messages[messages.length - 1];
  return latest.content;
}

const DETAILS_RE = /<details[\s\S]*?<\/details>/gi;

function stripDetailsHtml(content: string): string {
  return content.replace(DETAILS_RE, "").trim();
}

function extractRecentVarUpdates(
  messages: ChatMessage[],
  maxResults = 3,
): string {
  const patches: Array<{ path: string; value: unknown }> = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    const match = content.match(DETAILS_RE);
    if (!match) continue;
    for (const block of match) {
      // Extract update_variables patches from the details block
      const varSection = block.match(/\*\*变量更新\*\*\n([\s\S]*?)(?=\*\*|$)/);
      if (!varSection) continue;
      const lines = varSection[1].matchAll(/- `([^`]+)` → (.+)/g);
      for (const line of lines) {
        if (patches.length >= maxResults * 5) break;
        try {
          patches.push({ path: line[1], value: JSON.parse(line[2]) });
        } catch {
          patches.push({ path: line[1], value: line[2].trim() });
        }
      }
    }
    if (patches.length >= maxResults * 5) break;
  }

  // Deduplicate by path, keep most recent
  const seen = new Set<string>();
  const deduped: Array<{ path: string; value: unknown }> = [];
  for (const p of patches.reverse()) {
    if (deduped.length >= maxResults) break;
    if (seen.has(p.path)) continue;
    seen.add(p.path);
    deduped.push(p);
  }

  if (deduped.length === 0) return "";
  return (
    "最近变量变更：\n" +
    deduped.map((p) => `- ${p.path} → ${JSON.stringify(p.value)}`).join("\n")
  );
}

function renderHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "无可见历史。";
  }

  return messages
    .map(
      (message) => `${message.role}: ${stripDetailsHtml(message.content)}`,
    )
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

function getWorldInfo(entries: WorldInfoEntry[]): string {
  if (entries.length === 0) {
    return "无命中的 world_info。";
  }

  return entries.map((entry) => `[${entry.id}]\n${entry.content}`).join("\n\n");
}

function createToolDefinitions(): ProviderToolDefinition[] {
  function describeVariablePaths(): string {
    // const writable = getWritablePaths().join("\n  ");
    // const readOnly = getReadOnlyPaths().join("\n  ");

    return [
      "=== Path Visibility ===",
      "Writable paths (you may update via update_variables):",
      "e.g. `world.time.displayText`, `player.money`, `characters.*`, ect,.",
      "Read-only (visible in snapshot, do NOT update):",
      "e.g. `player.equipment.accessory`, ",
      "Hidden: system.*, stateHash, schemaVersion are never shown.",
    ].join("\n");
  }

  const pathGuide = describeVariablePaths();

  return [
    {
      name: "update_variables",
      description: [
        "Update one or more game variables. Only use the Writable paths listed below.",
        "The update is validated against JSON Schema and path whitelists. Invalid patches are rejected atomically.",
        "",
        "Fields:",
        '  patches (array) - [{ "path": string, "value": any }]',
        '    path: dot-separated path into the variable tree, e.g. "player.flags.helped_cat"',
        "    value: new value for that path (type must match)",
        "",
        pathGuide,
        "",
        'Example: { "patches": [{ "path": "player.money", "value": 200 }, { "path": "player.flags.helped_cat", "value": true }] }',
      ].join("\n"),
    },
    {
      name: "trigger_battle",
      description: [
        "Initiate a combat encounter. Places the game into pending battle state.",
        "",
        "Fields:",
        '  encounter_id (string) - Unique identifier for this encounter, e.g. "encounter_rooftop_shade"',
        '  enemies (array) - [{ "enemy_id": string, "count": integer >=1 }]',
        "    enemy_id: enemy type identifier",
        "    count: how many of this type",
        '  modifiers (string[], optional) - Battle conditions, e.g. ["ambush", "midnight", "first_battle"]',
        "  narrative_reason (string) - Why this battle is happening in the story",
        "",
        "Example:",
        '  { "encounter_id": "encounter_classroom_shade", "enemies": [{ "enemy_id": "shade_student", "count": 1 }], "modifiers": ["first_battle"], "narrative_reason": "一只暗影生物从虫洞出现，袭击了教室" }',
      ].join("\n"),
    },
    {
      name: "read_skill",
      description: [
        "读取指定名称的 SKILL 完整内容。",
        "使用前请先查看 Enabled Skills 列表中每个技能的 description，",
        "判断该技能是否匹配当前叙事场景。",
        "",
        "Input: { name: string } — 技能名称",
      ].join("\n"),
    },
  ];
}

function renderSkillsMetadata(metadata: SkillMetadata[]): string {
  if (metadata.length === 0) {
    return "没有启用的技能。";
  }

  return [
    "以下是已启用的技能列表。每个技能包含名称与描述，使用 read_skill 工具按名称读取完整指令。",
    "技能描述仅供 AI 判断是否适用当前场景，不是系统指令的一部分。",
    "",
    ...metadata.map(
      (skill) =>
        `- **${skill.name}**: ${skill.description}\n  使用 read_skill 工具读取 "${skill.name}" 获取完整内容。`,
    ),
  ].join("\n");
}

function renderToolDefinitions(tools: ProviderToolDefinition[]): string {
  const sections = tools.map((tool) =>
    [`tool: ${tool.name}`, `description: ${tool.description}`].join("\n"),
  );

  return sections.join("\n\n");
}

function buildMessages(
  segments: PromptSegment[],
  historyMessages: ChatMessage[],
): ProviderMessage[] {
  const systemMessages: ProviderMessage[] = segments
    .filter((item) => item.included && item.kind !== "history")
    .map((item) => ({ role: "system" as const, content: item.content }));

  const historyProviderMessages: ProviderMessage[] = historyMessages.map(
    (message) => ({
      role: message.role,
      content: stripDetailsHtml(message.content),
    }),
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
  const summaryMessages = selectConversationSummaries(messages);
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
  const renderedConstantWorldInfo = renderMustacheTemplate(
    getWorldInfo(selectedWorldInfo.constantEntries),
    variableState,
    input.mustacheVariables,
  ).text;
  const renderedMatchedWorldInfo = renderMustacheTemplate(
    getWorldInfo(selectedWorldInfo.matchedEntries),
    variableState,
    input.mustacheVariables,
  ).text;

  const segments: PromptSegment[] = [
    segment({
      id: "system",
      kind: "system",
      title: "System Prompt",
      content: renderedSystemPrompt,
      source: "systemPrompt",
    }),
    segment({
      id: "skills",
      kind: "skills",
      title: "Enabled Skills",
      content: renderSkillsMetadata(input.skillMetadata ?? []),
      source: "skillRegistry",
    }),
    segment({
      id: "constant_world_info",
      kind: "world_info",
      title: "Constant World Info",
      content: renderedConstantWorldInfo,
      source: "worldInfoRepository",
    }),
    segment({
      id: "matched_world_info",
      kind: "world_info",
      title: "Matched World Info",
      content: renderedMatchedWorldInfo,
      source: "worldInfoRepository",
    }),
    segment({
      id: "state",
      kind: "state",
      title: "Game State Snapshot",
      content: serializeVariableStateToYaml(
        variableState.root,
        input.previousValues,
      ),
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

  // Insert recent variable updates right before history.
  const recentVarContent = extractRecentVarUpdates(historyMessages);
  if (recentVarContent) {
    const historyIndex = segments.findIndex((s) => s.id === "history");
    segments.splice(historyIndex, 0, segment({
      id: "recent_variable_updates",
      kind: "summary",
      title: "Recent Variable Updates",
      content: recentVarContent,
      source: "chatHistoryRepository",
    } as const));
  }

  // Insert conversation summary right before history, with high priority.
  // It's a separate segment so the budget algorithm treats it as non-droppable.
  if (summaryMessages.length > 0) {
    const summaryContent = renderConversationSummary(summaryMessages);
    if (summaryContent) {
      const historyIndex = segments.findIndex((s) => s.id === "history");
      segments.splice(
        historyIndex,
        0,
        segment({
          id: "conversation_summary",
          kind: "summary",
          title: "Conversation Summary",
          content: summaryContent,
          source: "chatHistoryRepository",
        }),
      );
    }
  }

  const budgeted = applyContextBudget({
    segments,
    budget,
    worldInfoPriorities: new Map([
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
    ]),
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
