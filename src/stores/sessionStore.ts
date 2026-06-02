import { BattleResultService } from "@/engine/battleResultService";
import { RuntimePersistenceService } from "@/engine/runtimePersistenceService";
import { ConversationSummarizer } from "@/engine/conversationSummarizer";
import {
  CombatRefreshRecoveryService,
  type CombatRefreshRecoveryResult,
} from "@/engine/combatRefreshRecoveryService";
import { createCheckpointManager } from "@/engine/checkpointManager";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { ensureVariableState } from "@/engine/variableStateBootstrap";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import { buildConfiguredHarnessRequest } from "@/orchestrator/configuredPromptBuilder";
import { getPromptPresetRepository } from "@/orchestrator/promptPreset";
import { createConfiguredProviderClient } from "@/orchestrator/providerSettings";
import { getProviderSettingsRepository } from "@/orchestrator/providerSettings";
import { createConfiguredSummaryProviderClient } from "@/orchestrator/providerSettings";
import {
  RecoveryService,
  type RollbackResult,
} from "@/engine/recoveryService";
import type {
  TriggerBattleToolEnvelope,
  TriggerBattleToolResult,
  UpdateVariablesToolEnvelope,
  UpdateVariablesToolResult,
} from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import type { DbWorkerClient } from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import {
  DbRuntimeSnapshotRepository,
  type RuntimeSnapshotRepository,
} from "@/persistence/repositories/runtimeSnapshotRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
  type VariableChangeLogRepository,
  type VariableRepository,
} from "@/persistence/repositories/variableRepository";
import {
  DbWorldInfoRepository,
  InMemoryWorldInfoRepository,
  type WorldInfoRepository,
} from "@/persistence/repositories/worldInfoRepository";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { usePromptViewerStore } from "@/stores/promptViewerStore";
import type { BattleParticipant } from "@/types/battle";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { defineStore } from "pinia";
import { ref } from "vue";
import { getCharacter } from "@/content/contentRegistry";
import { getAllCharacterIds } from "@/content/contentRegistry";
import { getAllItems } from "@/content/contentRegistry";
import { VariableEngine } from "@/engine/variableEngine";
import type { CharacterContent, SkillTreeNode } from "@/types/content";
import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";

const POST_COMBAT_CONTINUE_INPUT = "请根据最近的战斗摘要继续剧情。";

function createPostCombatId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function createStoryTurnId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function createRecoveryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

export const useSessionStore = defineStore("session", () => {
  const sessionManager = createSessionManager();
  let variableRepository: VariableRepository = new InMemoryVariableRepository();
  let variableChangeLogRepository: VariableChangeLogRepository =
    new InMemoryVariableChangeLogRepository();
  let runtimeSnapshotRepository: RuntimeSnapshotRepository | null = null;
  let runtimePersistenceService: RuntimePersistenceService | null = null;
  let worldInfoRepository: WorldInfoRepository = new InMemoryWorldInfoRepository();
  let gameEngineFacade = new GameEngineFacade(sessionManager, {
    variableRepository,
    variableChangeLogRepository,
  });
  let toolExecutor = new ToolExecutor(gameEngineFacade);
  const variableEngine = new VariableEngine();
  const snapshot = ref(gameEngineFacade.getSessionSnapshot());
  const isStoryTurnRunning = ref(false);

  // ── Skill tree state ──
  const learnedSkills = ref<Map<string, Set<string>>>(new Map());

  async function loadLearnedSkills() {
    try {
      const varState = await variableRepository.getCurrent();
      const stored = varState?.root.player.learnedSkills ?? {};
      const map = new Map<string, Set<string>>();
      for (const [charId, skillIds] of Object.entries(stored)) {
        map.set(charId, new Set(skillIds));
      }

      // Always merge innateSkills from character definitions
      for (const charId of getAllCharacterIds()) {
        let charContent;
        try { charContent = getCharacter(charId); } catch { continue; }
        const charSet = map.get(charId) ?? new Set<string>();
        let changed = false;
        for (const innateId of charContent.innateSkills) {
          if (!charSet.has(innateId)) {
            charSet.add(innateId);
            changed = true;
          }
        }
        if (changed) map.set(charId, charSet);
      }
      learnedSkills.value = map;
    } catch {
      // variableRepository unavailable; keep empty map
    }
  }

  function isSkillLearned(characterId: string, skillId: string): boolean {
    const skills = learnedSkills.value.get(characterId);
    if (!skills) return false;
    return skills.has(skillId);
  }

  function getLearnableSkills(
    characterId: string,
    currentLevel: number,
  ): SkillTreeNode[] {
    let character: CharacterContent;
    try {
      character = getCharacter(characterId);
    } catch {
      return [];
    }

    const learned = learnedSkills.value.get(characterId) ?? new Set<string>();

    return character.skillTree.filter((node) => {
      if (learned.has(node.skillId)) return false;
      if (currentLevel < node.requiredLevel) return false;
      if (node.prerequisites.length > 0) {
        const allPrereqsMet = node.prerequisites.every((prereq) =>
          learned.has(prereq),
        );
        if (!allPrereqsMet) return false;
      }
      return true;
    });
  }

  type LearnSkillResult =
    | "ok"
    | "not_in_tree"
    | "already_learned"
    | "level_insufficient"
    | "missing_prerequisites"
    | "insufficient_money";

  async function learnSkill(
    characterId: string,
    skillId: string,
  ): Promise<LearnSkillResult> {
    let character: CharacterContent;
    try {
      character = getCharacter(characterId);
    } catch {
      return "not_in_tree";
    }

    const node = character.skillTree.find((n) => n.skillId === skillId);
    if (!node) return "not_in_tree";

    const learned = learnedSkills.value.get(characterId) ?? new Set<string>();
    if (learned.has(skillId)) return "already_learned";

    // Read current variable state for level and money
    const varState = await variableRepository.getCurrent();
    if (!varState) return "level_insufficient";

    const currentLevel = varState.root.player.combat.level;
    if (currentLevel < node.requiredLevel) return "level_insufficient";

    if (node.prerequisites.length > 0) {
      const allMet = node.prerequisites.every((p) => learned.has(p));
      if (!allMet) return "missing_prerequisites";
    }

    const currentMoney = varState.root.player.money;
    if (currentMoney < node.cost) return "insufficient_money";

    // Deduct money via variable patch
    const newMoney = currentMoney - node.cost;
    const skillCallId = `skill-learn-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    // Build updated learned skills list for persistence
    const currentLearnedForChar =
      varState.root.player.learnedSkills?.[characterId] ?? [];
    const updatedLearnedForChar = [...currentLearnedForChar, skillId];

    // Deduct money and persist learned skills atomically
    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: `skill-learn-${characterId}-${skillId}`,
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: skillCallId,
        patches: [
          { path: "player.money", value: newMoney },
          {
            path: `player.learnedSkills.${characterId}`,
            value: updatedLearnedForChar,
          },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);

    // Add to learned skills
    const updated = new Set(learned);
    updated.add(skillId);
    learnedSkills.value = new Map(learnedSkills.value).set(characterId, updated);
    snapshot.value = gameEngineFacade.getSessionSnapshot();

    return "ok";
  }

  // ── Skill slot management (max 8, innate "0" (attack) and "130" (guard) excluded) ──

  const INNATE_SKILL_IDS = new Set(["0", "130"]);

  async function equipSkill(
    characterId: string,
    skillId: string,
  ): Promise<"ok" | "not_learned" | "innate_skill" | "slots_full" | "already_equipped"> {
    const learned = learnedSkills.value.get(characterId);
    if (!learned || !learned.has(skillId)) return "not_learned";
    if (INNATE_SKILL_IDS.has(skillId)) return "innate_skill";

    const varState = await variableRepository.getCurrent();
    if (!varState) return "not_learned";

    const charState = varState.root.characters[characterId];
    const current = charState?.equippedSkills ?? [];

    if (current.includes(skillId)) return "already_equipped";
    if (current.length >= 8) return "slots_full";

    const updated = [...current, skillId];
    const callId = `equip-skill-${Date.now().toString(36)}`;
    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: `equip-skill-${characterId}`,
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: callId,
        patches: [
          { path: `characters.${characterId}.equippedSkills`, value: updated },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);
    return "ok";
  }

  async function unequipSkill(
    characterId: string,
    skillId: string,
  ): Promise<"ok" | "not_equipped"> {
    const varState = await variableRepository.getCurrent();
    if (!varState) return "not_equipped";

    const charState = varState.root.characters[characterId];
    const current = charState?.equippedSkills ?? [];
    if (!current.includes(skillId)) return "not_equipped";

    const updated = current.filter((id) => id !== skillId);
    const callId = `unequip-skill-${Date.now().toString(36)}`;
    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: `unequip-skill-${characterId}`,
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: callId,
        patches: [
          { path: `characters.${characterId}.equippedSkills`, value: updated },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);
    return "ok";
  }

  async function equipAccessory(
    characterId: string,
    itemId: string | null,
  ): Promise<"ok"> {
    const varState = await variableRepository.getCurrent();
    if (!varState) return "ok";
    const callId = `equip-accessory-${Date.now().toString(36)}`;
    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: `equip-accessory-${characterId}`,
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: callId,
        patches: [
          { path: `characters.${characterId}.equipment.accessory`, value: itemId },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);
    return "ok";
  }

  function createDbRecoveryRepositories(client: DbWorkerClient) {
    return {
      checkpointRepository: new DbCheckpointRepository(client),
      eventLogRepository: new DbEventLogRepository(client),
      chatRepository: new DbChatHistoryRepository(client),
      variableRepository: new DbVariableRepository(client),
    };
  }

  function getDbRecoveryRepositories() {
    const client = getChatPersistenceClient();

    if (!client) {
      return null;
    }

    return createDbRecoveryRepositories(client);
  }

  async function configurePersistence(input: { client: DbWorkerClient }) {
    const nextVariableRepository = new DbVariableRepository(input.client);
    await ensureVariableState(nextVariableRepository);
    const nextRuntimeSnapshotRepository = new DbRuntimeSnapshotRepository(
      input.client,
    );

    variableRepository = nextVariableRepository;
    variableChangeLogRepository = new DbVariableChangeLogRepository(
      input.client,
    );
    worldInfoRepository = new DbWorldInfoRepository(input.client);
    runtimeSnapshotRepository = nextRuntimeSnapshotRepository;
    runtimePersistenceService = new RuntimePersistenceService({
      repository: nextRuntimeSnapshotRepository,
    });

    const currentSnapshot = gameEngineFacade.getSessionSnapshot();
    gameEngineFacade = new GameEngineFacade(sessionManager, {
      variableRepository,
      variableChangeLogRepository,
    });
    const runtimeSnapshot = await runtimeSnapshotRepository.getCurrent();
    const battleStore = useBattleStore();

    if (runtimeSnapshot) {
      gameEngineFacade.restoreSessionSnapshot(runtimeSnapshot.sessionSnapshot);
      battleStore.restoreBattleSnapshot({
        pendingBattle: runtimeSnapshot.pendingBattle ?? undefined,
        activeBattle: runtimeSnapshot.activeBattle ?? undefined,
      });
    } else {
      gameEngineFacade.restoreSessionSnapshot(currentSnapshot);
    }

    toolExecutor = new ToolExecutor(gameEngineFacade);
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function persistRuntimeSnapshot() {
    if (!runtimePersistenceService) {
      return;
    }

    const battleStore = useBattleStore();

    await runtimePersistenceService.saveCurrent({
      sessionSnapshot: gameEngineFacade.getSessionSnapshot(),
      pendingBattle: battleStore.pendingBattle,
      activeBattle: battleStore.activeBattle,
    });
  }

  async function createRecoveryCheckpoint(input: {
    kind: "idle_checkpoint" | "combat_checkpoint";
    reason: string;
    encounterId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      return null;
    }

    const battleStore = useBattleStore();
    const manager = createCheckpointManager({
      ...repositories,
      getSessionSnapshot: () => gameEngineFacade.getSessionSnapshot(),
      getPendingBattle: () => battleStore.pendingBattle,
      getActiveBattle: () => battleStore.activeBattle,
      idFactory: {
        checkpointId: () => createRecoveryId("checkpoint"),
        eventId: () => createRecoveryId("event"),
      },
    });

    return manager.createCheckpoint({
      kind: input.kind,
      reason: input.reason,
      metadata: {
        refreshRecovery: true,
        safeRollbackKind: "idle_checkpoint",
        encounterId: input.encounterId,
        ...input.metadata,
      },
    });
  }

  async function markCombatCheckpoint(input: {
    reason: string;
    encounterId?: string;
  }) {
    await createRecoveryCheckpoint({
      kind: "combat_checkpoint",
      reason: input.reason,
      encounterId: input.encounterId,
      metadata: {
        combatSessionState: snapshot.value.sessionState,
      },
    });
  }

  async function markLatestCombatCheckpointFinished() {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      return;
    }

    const checkpoint =
      await repositories.checkpointRepository.getLatestByKind(
        "combat_checkpoint",
      );

    if (!checkpoint) {
      return;
    }

    await repositories.checkpointRepository.save({
      ...checkpoint,
      metadata: {
        ...checkpoint.metadata,
        finished: true,
        finishedAt: new Date().toISOString(),
      },
    });
  }

  function beginAiRequest(requestId: string) {
    gameEngineFacade.beginAiRequest(requestId);
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    void persistRuntimeSnapshot();
  }

  async function executeTriggerBattle(
    envelope: TriggerBattleToolEnvelope,
  ): Promise<TriggerBattleToolResult> {
    const battleStore = useBattleStore();
    const result = await toolExecutor.execute(envelope);

    snapshot.value = gameEngineFacade.getSessionSnapshot();

    if (result.ok) {
      battleStore.stagePendingEncounter({
        encounterId: result.output.encounterId,
        narrativeReason: envelope.input.narrative_reason,
        enemies: envelope.input.enemies,
      });
      await markCombatCheckpoint({
        reason: "combat_pending",
        encounterId: result.output.encounterId,
      });
    }

    await persistRuntimeSnapshot();

    return result;
  }

  async function executeUpdateVariables(
    envelope: UpdateVariablesToolEnvelope,
  ): Promise<UpdateVariablesToolResult> {
    const result = await toolExecutor.execute(envelope);
    snapshot.value = gameEngineFacade.getSessionSnapshot();

    return result;
  }

  function enterCombatPending() {
    gameEngineFacade.dispatchCommand({
      type: "TRIGGER_BATTLE",
      payload: {
        request_id: "session-store-enter-combat-pending",
        context_version: 1,
        state_hash: "initial",
        tool_call_id: "session-store-enter-combat-pending",
        input: {
          encounter_id: "session-store-pending-encounter",
          enemies: [{ enemy_id: "pending-placeholder", count: 1 }],
          narrative_reason: "Session store pending battle entrypoint.",
        },
      },
    });
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function startBattle(playerParty: BattleParticipant[]) {
    const battleStore = useBattleStore();

    battleStore.startBattle(playerParty);

    // Filter action menu to show only skills the current character has learned
    const firstPlayer = playerParty.find((p) => p.side === "player" && p.characterId);
    if (firstPlayer?.characterId && battleStore.activeBattle) {
      const charSkills = learnedSkills.value.get(firstPlayer.characterId);
      // Include innate skills (e.g. attack) from the character's definition
      let availableIds: Set<string> | undefined;
      try {
        const char = getCharacter(firstPlayer.characterId);
        const innate = new Set(char.innateSkills);
        if (charSkills) {
          charSkills.forEach((sid) => innate.add(sid));
        }
        availableIds = innate;
      } catch {
        availableIds = charSkills ?? undefined;
      }

      // Further filter to equipped skills only (innate 1 always included)
      const INNATE_IDS = new Set(["1"]);
      try {
        const varState = await variableRepository.getCurrent();
        const equipped = varState?.root.characters[firstPlayer.characterId]?.equippedSkills ?? [];
        const filtered = new Set<string>(INNATE_IDS);
        for (const sid of equipped) {
          if (availableIds?.has(sid)) filtered.add(sid);
        }
        availableIds = filtered;
      } catch {
        // If variable state unavailable, fall back to learned set
      }

      // Build battle items map from variable state inventory
      let battleItems: Record<string, number> | undefined;
      try {
        const vsItems = await variableRepository.getCurrent();
        const inventory = vsItems?.root.inventory;
        if (inventory?.items) {
          const items = getAllItems();
          const battleMap = {} as Record<string, number>;
          for (const [itemId, count] of Object.entries(inventory.items)) {
            const item = items.get(itemId);
            if (item?.type === 'consumable' && item.usableInBattle && count > 0) {
              battleMap[itemId] = count;
            }
          }
          battleItems = battleMap;
        }
      } catch {
        // Variable state unavailable, no battle items
      }

      // Set up item consumption handler
      battleStore.onItemConsumed = async (itemId: string) => {
        try {
          const vs = await variableRepository.getCurrent();
          if (!vs) return;
          const currentItems = (vs?.root.inventory.items ?? {}) as Record<string, number>;
          const cur = currentItems[itemId] ?? 0;
          const nc = Math.max(0, cur - 1);
          const up = { ...currentItems };
          if (nc <= 0) delete up[itemId]; else up[itemId] = nc;
          const cb = (vs?.root.inventory.battleItems ?? {}) as Record<string, number>;
          const ub = { ...cb };
          if (nc <= 0) delete ub[itemId]; else ub[itemId] = nc;
          const itemConsumeCallId = "item-consume-" + Date.now().toString(36);
          const pr = variableEngine.applyPatchSet({
            current: vs,
            envelope: {
              request_id: "item-consume-" + itemId,
              context_version: vs.version,
              state_hash: vs.stateHash,
              tool_call_id: itemConsumeCallId,
              patches: [
                { path: "inventory.items", value: up },
                { path: "inventory.battleItems", value: ub },
              ],
            },
          });
          await variableRepository.saveCurrent(pr.next);
          if (battleStore.activeBattle) {
            battleStore.activeBattle.actionMenu = createDefaultBattleCommandMenuTree(
              availableIds,
              ub,
            );
          }
        } catch {
          // skip
        }
      };

      // Rebuild menu with battle items
      battleStore.activeBattle.actionMenu = createDefaultBattleCommandMenuTree(availableIds, battleItems);
    }
    gameEngineFacade.enterCombat();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await markCombatCheckpoint({
      reason: "combat_active",
      encounterId: battleStore.activeBattle?.encounterId,
    });
    await persistRuntimeSnapshot();
  }

  function cancelPendingBattle() {
    if (snapshot.value.sessionState !== "COMBAT_PENDING") {
      throw new Error(
        `[COMBAT_PENDING_CANCEL_INVALID_STATE] Cannot cancel pending battle from ${snapshot.value.sessionState}.`,
      );
    }

    const battleStore = useBattleStore();

    battleStore.clearPendingEncounter();
    gameEngineFacade.resetToIdle();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    void persistRuntimeSnapshot();
  }

  async function completeActiveBattle() {
    const battleStore = useBattleStore();
    const chatStore = useChatStore();

    if (battleStore.activeBattle === null) {
      throw new Error(
        "[BATTLE_RESULT_REQUIRED] Cannot complete battle without an active battle snapshot.",
      );
    }

    const battleResultService = new BattleResultService({
      chatService: chatStore,
    });

    const result = await battleResultService.commitResolvedBattle(
      battleStore.activeBattle,
    );

    gameEngineFacade.markPostCombatReady();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await markLatestCombatCheckpointFinished();
    await persistRuntimeSnapshot();

    return result;
  }

  async function createStoryOrchestratorService(options: {
    requestId: string;
    userMessageId: string;
    assistantMessageId: string;
  }): Promise<OrchestratorService> {
    const chatStore = useChatStore();
    const chatRuntime = chatStore.getActiveChatRuntime();
    const configuredProvider = await createConfiguredProviderClient(
      undefined,
      { dispatchCommand: gameEngineFacade.dispatchCommand.bind(gameEngineFacade) },
    );
    const repositories = getDbRecoveryRepositories();
    const battleStore = useBattleStore();

    return new OrchestratorService({
      chatService: chatStore,
      gameEngineFacade,
      providerClient: configuredProvider.client,
      checkpointManager: repositories
        ? createCheckpointManager({
            ...repositories,
            getSessionSnapshot: () => gameEngineFacade.getSessionSnapshot(),
            getPendingBattle: () => battleStore.pendingBattle,
            getActiveBattle: () => battleStore.activeBattle,
            idFactory: {
              checkpointId: () => createRecoveryId("checkpoint"),
              eventId: () => createRecoveryId("event"),
            },
          })
        : undefined,
      eventLogRepository: repositories?.eventLogRepository,
      async buildRequest(input) {
        const request = await buildConfiguredHarnessRequest({
          ...input,
          chatRepository: chatRuntime.repository,
          variableRepository,
          worldInfoRepository,
          promptPresetRepository: getPromptPresetRepository(),
          requestId: options.requestId,
          now: new Date().toISOString(),
        });
        usePromptViewerStore().record(request, configuredProvider.providerInfo);
        return request;
      },
      idFactory: {
        userMessageId: () => options.userMessageId,
        assistantMessageId: () => options.assistantMessageId,
      },
      now: () => new Date().toISOString(),
    });
  }

  async function maybeSummarizeHistory() {
    const chatStore = useChatStore();
    const messages = await chatStore.getActiveChatRuntime().repository.list();
    const visibleMessages = messages.filter(
      (m) => m.ai_visible && m.finalized && m.kind !== "context_summary",
    );

    const settingsRepo = getProviderSettingsRepository();
    const settings = await settingsRepo.getState();

    if (!settings.summaryEnabled) {
      return;
    }

    const estimatedTokens = visibleMessages.reduce(
      (total, m) => total + Math.max(1, Math.ceil(m.content.length / 4)),
      0,
    );

    if (estimatedTokens < settings.summaryTokenThreshold) {
      return;
    }

    const splitIndex = Math.floor(visibleMessages.length * settings.summaryOldRatio);
    const oldMessages = visibleMessages.slice(0, splitIndex);

    if (oldMessages.length < 3) {
      return;
    }

    // Find previous summary if any, for progressive merging.
    const previousSummary = messages.find(
      (m) => m.kind === "context_summary" && m.finalized,
    );

    const configuredProvider = await createConfiguredSummaryProviderClient();
    const summarizer = new ConversationSummarizer({
      providerClient: configuredProvider.client,
    });

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

    // Mark summarized messages as not ai_visible so the summary replaces them in AI context.
    for (const msg of oldMessages) {
      await chatStore.getActiveChatRuntime().repository.save({
        ...msg,
        ai_visible: false,
      });
    }

    await chatStore.createContextSummaryMessage({
      id: createStoryTurnId("ctx-summary"),
      content: summary,
      createdAt: new Date().toISOString(),
    });
  }

  async function runStoryTurn(userInput: string) {
    const chatStore = useChatStore();
    isStoryTurnRunning.value = true;

    try {
      const orchestratorService = await createStoryOrchestratorService({
        requestId: createStoryTurnId("story-turn"),
        userMessageId: createStoryTurnId("msg-story-user"),
        assistantMessageId: createStoryTurnId("msg-story-assistant"),
      });

      const result = await orchestratorService.runUserTurn({
        userInput,
        userVisible: true,
        aiVisible: true,
      });

      await chatStore.refreshMessages();
      snapshot.value = gameEngineFacade.getSessionSnapshot();
      await persistRuntimeSnapshot();

      // Trigger summarization asynchronously — failure is non-fatal.
      maybeSummarizeHistory().catch((err) => {
        console.warn("[sessionStore] Summarization skipped:", err);
      });

      return result;
    } finally {
      isStoryTurnRunning.value = false;
    }
  }

  async function continuePostCombatStory() {
    if (snapshot.value.sessionState !== "POST_COMBAT_READY") {
      throw new Error(
        `[POST_COMBAT_CONTINUATION_INVALID_STATE] Cannot continue post-combat story from ${snapshot.value.sessionState}.`,
      );
    }

    const chatStore = useChatStore();
    const orchestratorService = await createStoryOrchestratorService({
      requestId: createPostCombatId("post-combat-continue"),
      userMessageId: createPostCombatId("msg-post-combat-user"),
      assistantMessageId: createPostCombatId("msg-post-combat-assistant"),
    });

    const result = await orchestratorService.runUserTurn({
      userInput: POST_COMBAT_CONTINUE_INPUT,
      userVisible: false,
      aiVisible: true,
    });

    await chatStore.refreshMessages();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await loadLearnedSkills();
    await persistRuntimeSnapshot();

    maybeSummarizeHistory().catch((err) => {
      console.warn("[sessionStore] Summarization skipped:", err);
    });

    return result;
  }

  function refreshSnapshot() {
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function markIdleCheckpointForRefreshRecovery() {
    return createRecoveryCheckpoint({
      kind: "idle_checkpoint",
      reason: "combat_refresh_idle_checkpoint",
    });
  }

  async function recoverFromInterruptedCombat(): Promise<CombatRefreshRecoveryResult> {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      return {
        recovered: false,
        mode: "noop",
      };
    }

    const battleStore = useBattleStore();
    const chatStore = useChatStore();
    const service = new CombatRefreshRecoveryService({
      ...repositories,
      restoreSessionSnapshot: (nextSnapshot) =>
        gameEngineFacade.restoreSessionSnapshot(nextSnapshot),
      resetSessionToIdle: () => gameEngineFacade.resetToIdle(),
      restoreBattleSnapshot: (input) =>
        battleStore.restoreBattleSnapshot(input),
      idFactory: {
        eventId: () => createRecoveryId("event"),
        recoveryMessageId: () =>
          createRecoveryId("msg-combat-refresh-recovery"),
      },
    });

    const result = await service.recoverFromInterruptedCombat();
    snapshot.value = gameEngineFacade.getSessionSnapshot();

    if (result.recovered) {
      await chatStore.refreshMessages();
    }

    await persistRuntimeSnapshot();

    return result;
  }

  async function restoreFromCheckpointSnapshot(
    checkpoint: CheckpointSnapshotRecord,
  ) {
    const battleStore = useBattleStore();

    if (checkpoint.variableValue !== null) {
      await variableRepository.saveCurrent(checkpoint.variableValue);
    }

    gameEngineFacade.restoreSessionSnapshot(checkpoint.sessionSnapshot);
    battleStore.restoreBattleSnapshot({
      pendingBattle: checkpoint.pendingBattle,
      activeBattle: checkpoint.activeBattle,
    });
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await persistRuntimeSnapshot();
  }

  async function rollbackToLatestIdleCheckpoint(): Promise<RollbackResult> {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      throw new Error(
        "[RECOVERY_DB_UNAVAILABLE] Cannot rollback without DB-backed persistence.",
      );
    }

    const battleStore = useBattleStore();
    const checkpoint =
      await repositories.checkpointRepository.getLatestByKind(
        "idle_checkpoint",
      );

    if (!checkpoint) {
      throw new Error(
        "[CHECKPOINT_NOT_FOUND] No checkpoint found for kind: idle_checkpoint.",
      );
    }

    const service = new RecoveryService({
      ...repositories,
      restoreSessionSnapshot: (nextSnapshot) =>
        gameEngineFacade.restoreSessionSnapshot(nextSnapshot),
      restoreBattleSnapshot: (input) =>
        battleStore.restoreBattleSnapshot(input),
      idFactory: {
        eventId: () => createRecoveryId("event"),
      },
    });
    const result = await service.rollbackToLatest("idle_checkpoint");

    if (checkpoint.variableValue !== null) {
      await variableRepository.saveCurrent(checkpoint.variableValue);
    }

    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await persistRuntimeSnapshot();

    return result;
  }

  return {
    snapshot,
    isStoryTurnRunning,
    learnedSkills,
    isSkillLearned,
    getLearnableSkills,
    learnSkill,
    equipSkill,
    unequipSkill,
    equipAccessory,
    configurePersistence,
    beginAiRequest,
    executeUpdateVariables,
    executeTriggerBattle,
    enterCombatPending,
    startBattle,
    cancelPendingBattle,
    completeActiveBattle,
    runStoryTurn,
    continuePostCombatStory,
    refreshSnapshot,
    markIdleCheckpointForRefreshRecovery,
    recoverFromInterruptedCombat,
    restoreFromCheckpointSnapshot,
    rollbackToLatestIdleCheckpoint,
  };
});
