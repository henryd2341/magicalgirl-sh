import { BattleResultService, type BattleRewards } from "@/engine/battleResultService";
import { RuntimePersistenceService } from "@/engine/runtimePersistenceService";
import { maybeSummarizeHistory as runHistorySummarization } from "@/engine/summary/historySummarizer";
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
import { serializeVariableStateToYaml } from "@/orchestrator/contextSerializer";
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
import { useSkillStore } from "@/stores/skillStore";
import { useProviderMetadataHistory } from "@/composables/useProviderMetadataHistory";
import type { BattleParticipant } from "@/types/battle";
import type { ChatMessage } from "@/types/chat";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { defineStore } from "pinia";
import { ref } from "vue";
import type { PreviousValueMap, VariablePathPatch } from "@/types/variables";
import { getCharacter, getCharacterByName } from "@/content/contentRegistry";
import { getAllCharacterIds, getGrowth } from "@/content/contentRegistry";
import { getAllItems } from "@/content/contentRegistry";
import { VariableEngine } from "@/engine/variableEngine";
import type { CharacterContent, GrowthContent, SkillTreeNode } from "@/types/content";
import {
  statsAtLevel,
  expRequiredForLevel,
  canLevelUp,
  computeAutoLevelStats,
} from "@/engine/battle/formulaEngine";
import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";

const POST_COMBAT_CONTINUE_INPUT = "请根据最近的战斗摘要继续剧情。";

// Idempotency guard: tracks encounter IDs whose rewards have been applied
const _appliedBattleRewardEncounters = new Set<string>();

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
  const lastPreviousValues = ref<PreviousValueMap>(new Map());
  const variableVersion = ref(0);

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
      character = getCharacterByName(characterId);
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
      character = getCharacterByName(characterId);
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
        bypassAllowlist: true,
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
    variableVersion.value++;

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

    const isProtagonist = characterId === "player";
    const current = isProtagonist
      ? (varState.root.player.equippedSkills ?? [])
      : (varState.root.characters[characterId]?.equippedSkills ?? []);

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
        bypassAllowlist: true,
        patches: [
          { path: isProtagonist ? "player.equippedSkills" : `characters.${characterId}.equippedSkills`, value: updated },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);
    variableVersion.value++;
    return "ok";
  }

  async function unequipSkill(
    characterId: string,
    skillId: string,
  ): Promise<"ok" | "not_equipped"> {
    const varState = await variableRepository.getCurrent();
    if (!varState) return "not_equipped";

    const isProtagonist = characterId === "player";
    const current = isProtagonist
      ? (varState.root.player.equippedSkills ?? [])
      : (varState.root.characters[characterId]?.equippedSkills ?? []);
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
        bypassAllowlist: true,
        patches: [
          { path: isProtagonist ? "player.equippedSkills" : `characters.${characterId}.equippedSkills`, value: updated },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);
    variableVersion.value++;
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
        bypassAllowlist: true,
        patches: [
          { path: `characters.${characterId}.equipment.accessory`, value: itemId },
        ],
      },
    });
    await variableRepository.saveCurrent(result.next);
    variableVersion.value++;
    return "ok";
  }

  async function applyBattleRewards(rewards: BattleRewards) {
    const varState = await variableRepository.getCurrent();
    if (!varState) return;

    const patches: VariablePathPatch[] = [];

    // Process character EXP and level-ups
    for (const [entityId, gainedExp] of rewards.characterExp) {
      // Route protagonist to root.player.combat, companions to root.characters[name].combat
      const isPlayer = entityId === "__player__";
      const combat = isPlayer
        ? varState.root.player.combat
        : varState.root.characters[entityId]?.combat;
      if (!combat) continue;
      const pathPrefix = isPlayer ? "player.combat" : `characters.${entityId}.combat`;

      let newExp = combat.exp + gainedExp;
      let currentLevel = combat.level;
      let currentHpMax = combat.hp.max;
      let currentMpMax = combat.mp.max;
      let currentAttack = combat.attack;
      let currentDefense = combat.defense;
      let currentAgility = combat.agility;
      let currentIntelligence = combat.intelligence;
      let unspentPoints = combat.unspentPoints;

      // Lookup growth data for level-up calculations
      let growth: GrowthContent | null = null;
      try {
        growth = isPlayer
          ? getGrowth("player")
          : getGrowth(getCharacterByName(entityId).growthId);
      } catch {
        // Character not found in content registry; skip level-up
      }

      if (growth) {
        while (
          newExp >= expRequiredForLevel(currentLevel) &&
          canLevelUp(currentLevel)
        ) {
          newExp -= expRequiredForLevel(currentLevel);
          currentLevel++;

          // Update base stats with per-level growth
          currentAttack += growth.perLevel.attack;
          currentDefense += growth.perLevel.defense;
          currentAgility += growth.perLevel.agility;
          currentIntelligence += growth.perLevel.intelligence;

          // Full HP/MP refresh from new level's base stats
          const nextStats = statsAtLevel(growth.base, growth.perLevel, currentLevel);
          currentHpMax = nextStats.hp.max;
          currentMpMax = nextStats.mp.max;

          unspentPoints += growth.perLevel.freePoints ?? 0;
        }
      }

      patches.push(
        { path: `${pathPrefix}.exp`, value: newExp },
        { path: `${pathPrefix}.level`, value: currentLevel },
        { path: `${pathPrefix}.hp.current`, value: currentHpMax },
        { path: `${pathPrefix}.hp.max`, value: currentHpMax },
        { path: `${pathPrefix}.mp.current`, value: currentMpMax },
        { path: `${pathPrefix}.mp.max`, value: currentMpMax },
        { path: `${pathPrefix}.attack`, value: currentAttack },
        { path: `${pathPrefix}.defense`, value: currentDefense },
        { path: `${pathPrefix}.agility`, value: currentAgility },
        { path: `${pathPrefix}.intelligence`, value: currentIntelligence },
        { path: `${pathPrefix}.unspentPoints`, value: unspentPoints },
      );
    }

    // Add money reward
    if (rewards.moneyGained > 0) {
      patches.push({
        path: "player.money",
        value: varState.root.player.money + rewards.moneyGained,
      });
    }

    if (patches.length === 0) return;

    const callId = `battle-rewards-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: "apply-battle-rewards",
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: callId,
        bypassAllowlist: true,
        patches,
      },
    });
    await variableRepository.saveCurrent(result.next);
    variableVersion.value++;
  }

  async function allocatePoints(
    characterId: string | null,
    allocatedPoints: { attack: number; defense: number; agility: number; intelligence: number },
    unspentPoints: number,
  ): Promise<"ok"> {
    const varState = await variableRepository.getCurrent();
    if (!varState) return "ok";

    const callId = `allocate-points-${Date.now().toString(36)}`;
    const target = characterId === null || characterId === "__player__" ? "player" : `characters.${characterId}`;
    const patches: VariablePathPatch[] = [
      { path: `${target}.combat.allocatedPoints`, value: allocatedPoints },
      { path: `${target}.combat.unspentPoints`, value: unspentPoints },
    ];

    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: `allocate-points-${characterId ?? "player"}`,
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: callId,
        bypassAllowlist: true,
        patches,
      },
    });
    await variableRepository.saveCurrent(result.next);
    variableVersion.value++;
    return "ok";
  }

  async function patchVariables(
    patches: VariablePathPatch[],
    requestId?: string,
  ): Promise<void> {
    if (patches.length === 0) return;
    const varState = await variableRepository.getCurrent();
    if (!varState) return;
    const callId = `patch-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const result = variableEngine.applyPatchSet({
      current: varState,
      envelope: {
        request_id: requestId ?? callId,
        context_version: varState.version,
        state_hash: varState.stateHash,
        tool_call_id: callId,
        bypassAllowlist: true,
        patches,
      },
    });
    await variableRepository.saveCurrent(result.next);
    variableVersion.value++;
  }

  async function setCharacterInParty(
    characterId: string,
    inParty: boolean,
  ): Promise<void> {
    const varState = await variableRepository.getCurrent();
    if (!varState) return;

    const charState = varState.root.characters[characterId];
    if (!charState) return;

    if (inParty) {
      // Adding to party: auto-level to match protagonist
      const protagonistLevel = varState.root.player.combat.level;
      const currentLevel = charState.combat?.level ?? 1;
      const growth = getGrowth(characterId);
      const perLevel = growth?.perLevel ?? { hp: 10, mp: 5, freePoints: 2 };

      const autoStats = computeAutoLevelStats(
        currentLevel,
        protagonistLevel,
        perLevel,
      );

      const patches: VariablePathPatch[] = [
        { path: `characters.${characterId}.inParty`, value: true },
        { path: `characters.${characterId}.isVanguard`, value: true },
      ];

      if (autoStats) {
        const newHp = (charState.combat?.hp.max ?? 50) + autoStats.hpBonus;
        const newMp = (charState.combat?.mp.max ?? 30) + autoStats.mpBonus;
        const newUnspent = (charState.combat?.unspentPoints ?? 0) + autoStats.freePointsGained;

        patches.push(
          { path: `characters.${characterId}.combat.level`, value: autoStats.newLevel },
          { path: `characters.${characterId}.combat.hp.max`, value: newHp },
          { path: `characters.${characterId}.combat.hp.current`, value: newHp },
          { path: `characters.${characterId}.combat.mp.max`, value: newMp },
          { path: `characters.${characterId}.combat.mp.current`, value: newMp },
          { path: `characters.${characterId}.combat.unspentPoints`, value: newUnspent },
        );
      }

      const callId = `party-add-${Date.now().toString(36)}`;
      const result = variableEngine.applyPatchSet({
        current: varState,
        envelope: {
          request_id: `set-character-in-party-${characterId}`,
          context_version: varState.version,
          state_hash: varState.stateHash,
          tool_call_id: callId,
          bypassAllowlist: true,
          patches,
        },
      });
      await variableRepository.saveCurrent(result.next);
      variableVersion.value++;
    } else {
      // Removing from party
      const callId = `party-remove-${Date.now().toString(36)}`;
      const result = variableEngine.applyPatchSet({
        current: varState,
        envelope: {
          request_id: `remove-character-from-party-${characterId}`,
          context_version: varState.version,
          state_hash: varState.stateHash,
          tool_call_id: callId,
          bypassAllowlist: true,
          patches: [
            { path: `characters.${characterId}.inParty`, value: false },
            { path: `characters.${characterId}.isVanguard`, value: false },
          ],
        },
      });
      await variableRepository.saveCurrent(result.next);
      variableVersion.value++;
    }
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
    lastPreviousValues.value = new Map();
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
    variableVersion.value++;

    if (result.ok) {
      lastPreviousValues.value = result.output.previousValues;
    }

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

    // Build availableSkillIds for each player participant
    let battleItems: Record<string, number> | undefined;

    if (battleStore.activeBattle) {
      // Build skills for each player character
      const varState = await variableRepository.getCurrent();

      let firstPlayerSkills: Set<string> | undefined;

      for (const player of playerParty) {
        if (player.side !== "player" || !player.characterId) continue;

        // Map "__player__" to "player" for content registry lookups
        const contentId = player.characterId === "__player__" ? "player" : player.characterId;
        const isProtagonist = player.characterId === "__player__";

        // Get learned skills (keyed by content ID in learnedSkills map)
        const charSkills = learnedSkills.value.get(contentId);
        let availableIds: Set<string> | undefined;
        try {
          const char = getCharacterByName(contentId);
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
        if (varState) {
          const equipped = isProtagonist
            ? (varState.root.player.equippedSkills ?? [])
            : (varState.root.characters[player.characterId]?.equippedSkills ?? []);
          const filtered = new Set<string>(INNATE_IDS);
          for (const sid of equipped) {
            if (availableIds?.has(sid)) filtered.add(sid);
          }
          availableIds = filtered;
        }

        if (availableIds) {
          player.availableSkillIds = availableIds;
          if (!firstPlayerSkills) firstPlayerSkills = availableIds;
        }
      }

      // Build battle items map from variable state inventory
      try {
        const inventory = varState?.root.inventory;
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
              bypassAllowlist: true,
              patches: [
                { path: "inventory.items", value: up },
                { path: "inventory.battleItems", value: ub },
              ],
            },
          });
          await variableRepository.saveCurrent(pr.next);
          if (battleStore.activeBattle) {
            const actorId = battleStore.activeBattle.currentActorId;
            const actor = battleStore.activeBattle.participants.find(p => p.id === actorId);
            const actorSkills = actor?.availableSkillIds;
            battleStore.activeBattle.actionMenu = createDefaultBattleCommandMenuTree(
              actorSkills ?? undefined,
              ub,
            );
          }
        } catch {
          // skip
        }
      };

      // Rebuild initial menu with first player's skills
      battleStore.activeBattle.actionMenu = createDefaultBattleCommandMenuTree(firstPlayerSkills, battleItems);
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

    // Apply rewards with idempotency guard
    const encounterId = battleStore.activeBattle.encounterId;
    if (!_appliedBattleRewardEncounters.has(encounterId)) {
      _appliedBattleRewardEncounters.add(encounterId);
      await applyBattleRewards(result.rewards);
    }

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
    const preRequestState = snapshot.value.sessionState;
    const configuredProvider = await createConfiguredProviderClient(
      undefined,
      {
        dispatchCommand: gameEngineFacade.dispatchCommand.bind(gameEngineFacade),
        getToolProfile: async (toolName: string) => {
          const repo = getProviderSettingsRepository();
          return repo.getToolProfile(toolName);
        },
        getVariableSnapshot: async () => {
          const state = await variableRepository.getCurrent();
          if (!state?.root) return "";
          return serializeVariableStateToYaml(
            state.root,
            lastPreviousValues.value.size > 0
              ? lastPreviousValues.value
              : undefined,
          );
        },
        getLastMessages: async () => {
          const messages = await chatRuntime.repository.list();
          const finalized = messages.filter(
            (m) => m.finalized && m.ai_visible,
          );
          const lastUser = finalized
            .filter((m) => m.role === "user")
            .slice(-1)[0];
          const lastAssistant = finalized
            .filter((m) => m.role === "assistant")
            .slice(-1)[0];
          return {
            user: lastUser?.content ?? "",
            assistant: lastAssistant?.content ?? "",
          };
        },
        onTriggerBattle: async (params) => {
          console.log("[sessionStore.onTriggerBattle] CALLED", params);
          const battleStore = useBattleStore();
          console.log("[sessionStore.onTriggerBattle] battleStore.pendingBattle before =", battleStore.pendingBattle);
          battleStore.stagePendingEncounter({
            encounterId: params.encounterId,
            narrativeReason: params.narrativeReason,
            enemies: params.enemies,
          });
          console.log("[sessionStore.onTriggerBattle] battleStore.pendingBattle after =", battleStore.pendingBattle);
          await markCombatCheckpoint({
            reason: "combat_pending",
            encounterId: params.encounterId,
          });
          console.log("[sessionStore.onTriggerBattle] markCombatCheckpoint done");
          await persistRuntimeSnapshot();
          console.log("[sessionStore.onTriggerBattle] persistRuntimeSnapshot done");
        },
      },
      async (calls) => {
        const battleStore = useBattleStore();
        const results: Array<{
          tool_name: string;
          tool_call_id: string;
          ok: boolean;
          output?: unknown;
          error?: string;
        }> = [];
        for (const call of calls) {
          const callId = `fake-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
          try {
            if (call.tool_name === "update_variables") {
              const input = call.input as { patches: VariablePathPatch[] };
              if (input.patches?.length > 0) {
                await patchVariables(input.patches, "fake-provider");
                results.push({
                  tool_name: "update_variables",
                  tool_call_id: callId,
                  ok: true,
                  output: { patches: input.patches },
                });
              } else {
                results.push({
                  tool_name: "update_variables",
                  tool_call_id: callId,
                  ok: false,
                  error: "empty patches",
                });
              }
            } else if (call.tool_name === "trigger_battle") {
              if (preRequestState === "POST_COMBAT_READY") {
                results.push({
                  tool_name: "trigger_battle",
                  tool_call_id: callId,
                  ok: true,
                  output: { accepted: false, reason: "skipped: post-combat continuation should not re-trigger battle" },
                });
                continue;
              }
              const input = call.input as {
                encounter_id: string;
                enemies: Array<{ enemy_id: string; count: number }>;
                modifiers?: string[];
                narrative_reason: string;
              };
              await gameEngineFacade.dispatchCommand({
                type: "TRIGGER_BATTLE",
                payload: {
                  tool_name: "trigger_battle",
                  tool_call_id: callId,
                  request_id: "fake-provider",
                  context_version: 1,
                  state_hash: "mock",
                  input,
                },
              });
              battleStore.stagePendingEncounter({
                encounterId: input.encounter_id,
                narrativeReason: input.narrative_reason,
                enemies: input.enemies,
              });
              await persistRuntimeSnapshot();
              results.push({
                tool_name: "trigger_battle",
                tool_call_id: callId,
                ok: true,
                output: {
                  accepted: true,
                  battleState: "pending",
                  encounterId: input.encounter_id,
                },
              });
            } else if (call.tool_name === "read_skill") {
              const input = call.input as { name: string };
              results.push({
                tool_name: "read_skill",
                tool_call_id: callId,
                ok: true,
                output: { name: input.name },
              });
            } else {
              results.push({
                tool_name: call.tool_name,
                tool_call_id: callId,
                ok: false,
                error: `unsupported tool: ${call.tool_name}`,
              });
            }
          } catch (err) {
            results.push({
              tool_name: call.tool_name,
              tool_call_id: callId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        snapshot.value = gameEngineFacade.getSessionSnapshot();
        return results;
      },
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
        const skillStore = useSkillStore();
        const request = await buildConfiguredHarnessRequest({
          ...input,
          chatRepository: chatRuntime.repository,
          variableRepository,
          worldInfoRepository,
          promptPresetRepository: getPromptPresetRepository(),
          skillMetadata: skillStore.enabledMetadata,
          previousValues: lastPreviousValues.value.size > 0
            ? lastPreviousValues.value
            : undefined,
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
    const runtime = chatStore.getActiveChatRuntime();

    await runHistorySummarization(
      {
        chatRepository: runtime.repository,
        createSummaryMessage: (input) =>
          chatStore.createContextSummaryMessage(input),
        settingsRepo: getProviderSettingsRepository(),
        providerClientFactory: async () => {
          const configured = await createConfiguredSummaryProviderClient();
          return configured.client;
        },
      },
      {
        now: () => new Date().toISOString(),
        idFactory: () => createStoryTurnId("ctx-summary"),
      },
    );
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

      useProviderMetadataHistory().record(result.providerMetadata);

      await chatStore.refreshMessages();
      snapshot.value = gameEngineFacade.getSessionSnapshot();
      variableVersion.value++;
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

  async function retryFromMessage(messageId: string) {
    const chatStore = useChatStore();

    if (isStoryTurnRunning.value) return;
    isStoryTurnRunning.value = true;

    try {
      const currentMessages = chatStore.messages;
      const targetIdx = currentMessages.findIndex(m => m.id === messageId);
      if (targetIdx === -1) return;

      const targetMessage = currentMessages[targetIdx];

      // Find the triggering user message (nearest preceding user message)
      let triggerUserMsg: ChatMessage | undefined;
      for (let i = targetIdx; i >= 0; i--) {
        if (currentMessages[i].role === "user") {
          triggerUserMsg = currentMessages[i];
          break;
        }
      }
      if (!triggerUserMsg) return;

      // Rollback to the latest idle checkpoint
      await rollbackToLatestIdleCheckpoint();
      await chatStore.refreshMessages();

      // Cascade deletion: keep messages through trigger user (AI retry) or before trigger user (user retry)
      const restoredMessages = chatStore.messages;
      const triggerIdx = restoredMessages.findIndex(
        m => m.id === triggerUserMsg!.id
      );
      const keepEndIdx = targetMessage.role === "assistant"
        ? triggerIdx + 1  // AI retry: keep through trigger user
        : triggerIdx;      // User retry: keep before trigger user
      const keepMessages = restoredMessages.slice(0, keepEndIdx);
      const repo = chatStore.getActiveChatRuntime().repository;
      await repo.replaceAll(keepMessages);
      await chatStore.refreshMessages();

      if (targetMessage.role === "assistant") {
        // AI message retry: trigger user message preserved, resume from it
        const orchestrator = await createRetryOrchestrator();
        await orchestrator.retryUserTurn({
          userContent: triggerUserMsg.content,
        });
      } else {
        // User message retry: runStoryTurn recreates the trigger user fresh
        await runStoryTurn(triggerUserMsg.content);
      }
    } finally {
      isStoryTurnRunning.value = false;
    }
  }

  async function createRetryOrchestrator(): Promise<OrchestratorService> {
    return createStoryOrchestratorService({
      requestId: createStoryTurnId("retry-turn"),
      userMessageId: createStoryTurnId("msg-retry-user"),
      assistantMessageId: createStoryTurnId("msg-retry-assistant"),
    });
  }

  async function continuePostCombatStory() {
    if (snapshot.value.sessionState !== "POST_COMBAT_READY") {
      throw new Error(
        `[POST_COMBAT_CONTINUATION_INVALID_STATE] Cannot continue post-combat story from ${snapshot.value.sessionState}.`,
      );
    }

    isStoryTurnRunning.value = true;

    try {
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
      variableVersion.value++;
      await loadLearnedSkills();
      await persistRuntimeSnapshot();

      maybeSummarizeHistory().catch((err) => {
        console.warn("[sessionStore] Summarization skipped:", err);
      });

      return result;
    } finally {
      isStoryTurnRunning.value = false;
    }
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
    lastPreviousValues.value = new Map();
    await persistRuntimeSnapshot();

    return result;
  }

  return {
    snapshot,
    isStoryTurnRunning,
    variableVersion,
    learnedSkills,
    isSkillLearned,
    getLearnableSkills,
    learnSkill,
    equipSkill,
    unequipSkill,
    equipAccessory,
    applyBattleRewards,
    allocatePoints,
    patchVariables,
    setCharacterInParty,
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
    retryFromMessage,
    getVariableSnapshot: () => variableRepository.getCurrent(),
    previewPrompt: async (userInput: string) => {
      const promptViewerStore = usePromptViewerStore();
      const skillStore = useSkillStore();
      const chatStore = useChatStore();
      const chatRuntime = chatStore.getActiveChatRuntime();
      const configuredProvider = await createConfiguredProviderClient();
      const request = await buildConfiguredHarnessRequest({
        userInput,
        chatRepository: chatRuntime.repository,
        variableRepository,
        worldInfoRepository,
        promptPresetRepository: getPromptPresetRepository(),
        skillMetadata: skillStore.enabledMetadata,
        previousValues: new Map(),
        requestId: `preview-${Date.now()}`,
        now: new Date().toISOString(),
      });
      promptViewerStore.record(request, configuredProvider.providerInfo);
      return request;
    },
  };
});
