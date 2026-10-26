<script setup lang="ts">
import {
  findBattleActionMenuNodeById,
  getBattleActionDefinition,
} from "@/engine/battle/battleActionCatalog";
import { getEnemy, getSkill, getItem } from "@/content/contentRegistry";
import { useBattleStore } from "@/stores/battleStore";
import { useGameDialog } from "@/composables/useGameDialog";
import { useSessionStore } from "@/stores/sessionStore";
import allyIcon from "@/assets/pressTurnIcon/allyIcon.svg";
import allyIconBright from "@/assets/pressTurnIcon/allyIconBright.svg";
import enemyIcon from "@/assets/pressTurnIcon/enemyIcon.svg";
import enemyIconBright from "@/assets/pressTurnIcon/enemyIconBright.svg";
import type {
  BattleActionId,
  BattleActionMenuNode,
  BattleEnemyInstance,
  BattleParticipant,
} from "@/types/battle";
import BattleBroadcastWindow from "@/ui/battle/BattleBroadcastWindow.vue";
import { getChallengeBossSprite } from "@/ui/battle/battleEnemySprites";
import BattleCommandMenu from "@/ui/battle/BattleCommandMenu.vue";
import BattlePartyCard from "@/ui/battle/BattlePartyCard.vue";
import BattleStatusEffects from "@/ui/battle/BattleStatusEffects.vue";
import BattleInspectionDialog from "@/ui/battle/BattleInspectionDialog.vue";
import { findNextEligibleActorId } from "@/engine/battle/battleTurnQueue";
import BattleStatusPanel from "@/ui/battle/BattleStatusPanel.vue";
import BattleEffectsLayer from "@/ui/battle/BattleEffectsLayer.vue";
import { useBattlePresentation } from "@/ui/battle/useBattlePresentation";
import { useProgressiveEnemyTurn } from "@/ui/battle/useProgressiveEnemyTurn";
import { useFormationStore } from "@/stores/formationStore";
import { buildPlayerPartyFromFormation } from "@/engine/battle/battleSetup";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const battleStore = useBattleStore();
const sessionStore = useSessionStore();
const { confirm } = useGameDialog();
const { pendingBattle, activeBattle: canonicalBattle } = storeToRefs(battleStore);
const effectsLayer = ref<InstanceType<typeof BattleEffectsLayer> | null>(null);
const presentation = useBattlePresentation(battleStore, () => effectsLayer.value);
const { displayedBattle: activeBattle, busy, actionText, feedback } = presentation;
useProgressiveEnemyTurn({
  battle: canonicalBattle,
  battleGeneration: () => battleStore.battleGeneration,
  delayMs: 150,
  waitUntilReady: presentation.waitUntilReady,
  advance: () => presentation.run(() => battleStore.resolveNextEnemyAction()),
});
const transformedAvatars = import.meta.glob(
  "../../assets/avatars/transformed/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const allSprites = import.meta.glob("../../assets/sprites/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/**
 * Chinese creature name -> English sprite filename (no extension).
 * Maps CREATURE_1 / CREATURE_2 entries from generate_enemies.py to sprite files.
 */
const CREATURE_SPRITE_MAP: Record<string, string> = {
  // CREATURE_1 (single char) — default variant uses bare name (no number)
  "兽": "beast",
  "蝶": "bug",
  "蜥": "lizzard",
  "蟒": "snake",
  "鸟": "bird",
  "鱼": "fish",
  "龟": "turtle",
  "牛": "cow",
  "隼": "bird3",
  "鹿": "deer",
  "狐": "fox",
  "犬": "dog",
  "猫": "cat",
  "兔": "rabbit",
  "蟹": "crab2",
  "蝎": "scorpion",
  "熊": "bear1",
  "豹": "leopard",
  "蝠": "bat1",

  // CREATURE_2 (two char) — more specific, tried first
  "飞蛾": "bug2",
  "巨蜥": "lizzard2",
  "毒蛇": "snake2",
  "猛禽": "bird2",
  "海兽": "carb",
  "陆龟": "turtle2",
  "剑隼": "bird3",
  "角马": "cow3",
  "猎犬": "dog2",
  "影猫": "cat2",
  "白兔": "rabbit",
  "巨蟹": "crab2",
  "天鹅": "bird4",
  "暴熊": "bear2",
  "暗蝠": "bat2",
  "坚龟": "turtle2",
  "幻蛇": "snake3",
  "巨兽": "beast",
  "水母": "jellyfish",
  "飞蛇": "snake5",
  "鳞鱼": "fish2",
  "刃龟": "turtle3",
  "火鸟": "bird5",
};

const CREATURE_KEYS = Object.keys(CREATURE_SPRITE_MAP).sort(
  (a, b) => b.length - a.length,
);

const pressTurnIconAssets = {
  player: { solid: allyIcon, bright: allyIconBright },
  enemy: { solid: enemyIcon, bright: enemyIconBright },
};

const pendingEnemySummaries = computed(() => {
  if (pendingBattle.value === null) {
    return [];
  }

  const counts = new Map<string, { enemyId: string; count: number }>();

  for (const enemy of pendingBattle.value.enemies) {
    const current = counts.get(enemy.enemyId);

    if (current) {
      current.count += 1;
      continue;
    }

    counts.set(enemy.enemyId, {
      enemyId: enemy.enemyId,
      count: 1,
    });
  }

  return Array.from(counts.values());
});

const pendingEnemies = computed(() => {
  return pendingBattle.value?.enemies ?? [];
});

const activeParticipants = computed(() => {
  return activeBattle.value?.participants ?? [];
});

const activeEnemies = computed(() => {
  return activeParticipants.value.filter(
    (participant) => participant.side === "enemy",
  );
});

const activePlayers = computed(() => {
  return activeParticipants.value.filter(
    (participant) => participant.side === "player",
  );
});

const selectedActionDefinition = computed(() => {
  const actionId = activeBattle.value?.selectedActionId;

  if (actionId == null) {
    return null;
  }

  return getBattleActionDefinition(actionId);
});

const selectedTarget = computed(() => {
  const target = activeParticipants.value.find(
    (participant) => participant.id === activeBattle.value?.selectedTargetId,
  );

  if (target) {
    if (
      selectedActionDefinition.value?.selectionMode === "selective" &&
      !selectedActionDefinition.value.allowedSides.includes(target.side)
    ) {
      return null;
    }
    return target;
  }

  // Don't default to enemy when selecting ally
  if (activeBattle.value?._targetTypeHint === "single_ally") return null;

  const fallback = activeEnemies.value[0] ?? null;
  if (fallback == null) return null;

  if (
    selectedActionDefinition.value?.selectionMode === "selective" &&
    !selectedActionDefinition.value.allowedSides.includes(fallback.side)
  ) {
    return null;
  }

  return fallback;
});

const selectedEnemyTarget = computed(() => {
  return (
    activeEnemies.value.find(
      (participant) => participant.id === activeBattle.value?.selectedTargetId,
    ) ??
    activeEnemies.value[0] ??
    null
  );
});

const currentActor = computed(() => {
  if (activeBattle.value === null) {
    return null;
  }

  return (
    activeParticipants.value.find(
      (participant) => participant.id === activeBattle.value?.currentActorId,
    ) ?? null
  );
});

const rootActionMenu = computed(() => {
  return activeBattle.value?.actionMenu ?? [];
});

const currentMenuNode = computed(() => {
  const currentMenuNodeId = activeBattle.value?.currentMenuNodeId;

  if (currentMenuNodeId == null) {
    return null;
  }

  return findBattleActionMenuNodeById(rootActionMenu.value, currentMenuNodeId);
});

const selectedAction = computed(() => {
  const selectedActionId = activeBattle.value?.selectedActionId;

  if (selectedActionId == null) {
    return null;
  }

  return findBattleActionMenuNodeByActionId(
    rootActionMenu.value,
    selectedActionId,
  );
});

const selectedActionDescription = computed(() => {
  return (
    selectedAction.value?.description ??
    currentMenuNode.value?.description ??
    "行动描述框"
  );
});

const hoveredCommandDescription = ref<string | null>(null);

const displayCommandDescription = computed(() => {
  return hoveredCommandDescription.value ?? (targetHintText.value || selectedActionDescription.value);
});

function onHoverCommandDescription(desc: string | null) {
  hoveredCommandDescription.value = desc;
}

const isCommandMenuLocked = computed(() => {
  return busy.value || activeBattle.value?.phase === "ENEMY_TURN";
});

// ── Target selection helpers ──

const targetTypeHint = computed(() => {
  return activeBattle.value?._targetTypeHint ?? null;
});

const canSelectAlly = computed(() => {
  if (busy.value) return false;
  if (!activeBattle.value) return false;
  // During swap phases, use swap handlers, not target selection
  if (activeBattle.value.swapPhase !== "idle") return false;
  return targetTypeHint.value === "single_ally";
});

const canSelectEnemy = computed(() => {
  if (busy.value) return false;
  if (!activeBattle.value) return true;
  // During swap phases, enemies are not clickable
  if (activeBattle.value.swapPhase !== "idle") return false;
  // If no action selected or single_enemy skill, enemies are clickable
  if (targetTypeHint.value == null) return true;
  return targetTypeHint.value === "single_enemy";
});

const targetHintText = computed(() => {
  if (activeBattle.value?.swapPhase === "select_out") return "选择要换下的成员";
  if (activeBattle.value?.swapPhase === "select_in") return "选择要换上的成员（可选）";
  if (targetTypeHint.value === "single_ally") return "选择一个队友";
  if (targetTypeHint.value === "single_enemy") return "选择一个敌人";
  return "";
});

// ── Swap helpers ──

const swapPhase = computed(() => {
  return activeBattle.value?.swapPhase ?? "idle";
});

const swapOutCandidates = computed(() => {
  if (swapPhase.value !== "select_out") return [];
  const activeCount = activePlayers.value.filter(p => p.isActive && !p.isDown).length;
  const reserveCount = reservePlayers.value.filter(p => !p.isDown).length;

  // Allow current actor to swap out only if there are reserves to replace them
  const candidates = activePlayers.value.filter(p => {
    if (!p.isActive || p.isDown) return false;
    if (p.id === currentActor.value?.id) {
      // Current actor can only swap out if there's a reserve to take their place
      return reserveCount > 0 || activeCount > 1;
    }
    return true;
  });

  // No candidates if swapping would leave zero active players with no reserve
  if (candidates.length === 0) return [];
  const wouldLeaveZeroActive = candidates.every(p => p.id === currentActor.value?.id)
    ? activeCount <= 1 && reserveCount === 0
    : false;
  if (wouldLeaveZeroActive) return [];

  return candidates;
});

const reservePlayers = computed(() => {
  return activeParticipants.value.filter(
    p => p.side === "player" && !p.isActive,
  );
});

// ── Swap actions ──

function selectSwapOut(participantId: string) {
  void presentation.run(() => battleStore.selectSwapOut(participantId));
}

function selectSwapIn(participantId: string | null) {
  void presentation.run(() => battleStore.selectSwapIn(participantId));
}

function cancelSwap() {
  if (busy.value) return;
  battleStore.cancelSwap();
}

const overlayMode = computed(() => {
  if (activeBattle.value !== null) {
    return "active";
  }

  if (pendingBattle.value !== null) {
    return "pending";
  }

  return "empty";
});

function selectTarget(targetId: string) {
  void presentation.run(() => battleStore.selectTarget(targetId));
}

function selectMenuNode(nodeId: string) {
  void presentation.run(() => battleStore.selectMenuNode(nodeId));
}

function returnToRootMenu() {
  if (busy.value) return;
  battleStore.returnToRootMenu();
}

function cancelPendingBattle() {
  sessionStore.cancelPendingBattle();
}

const formationStore = useFormationStore();

const playerGender = ref<string>("女");

onMounted(async () => {
  try {
    const vars = await sessionStore.getVariableSnapshot();
    if (vars?.root?.player?.profile?.gender) {
      playerGender.value = vars.root.player.profile.gender;
    }
  } catch { /* variable store not ready */ }
});

async function startPendingBattle() {
  const vars = await sessionStore.getVariableSnapshot();
  if (!vars?.root) {
    // eslint-disable-next-line no-console
    console.warn("[BattleOverlay] No variable state — cannot start battle.");
    return;
  }

  playerGender.value = vars.root.player?.profile?.gender ?? "女";

  const formation = await formationStore.getFormation();
  const playerParty = buildPlayerPartyFromFormation(vars.root, formation.vanguard);
  await sessionStore.startBattle(playerParty);
}

const isTrainingBattle = computed(() =>
  activeBattle.value?.source === "training/free" ||
  activeBattle.value?.source === "training/challenge",
);

const canExitTraining = computed(() =>
  isTrainingBattle.value && activeBattle.value?.phase !== "RESULT",
);

async function completeBattle() {
  if (busy.value) return;
  if (isTrainingBattle.value) {
    await sessionStore.completeTrainingBattle();
    return;
  }
  await sessionStore.completeActiveBattle();
}

async function exitTraining() {
  if (!canExitTraining.value) return;
  const accepted = await confirm(
    "退出训练将放弃本次训练进度，是否继续？",
    { confirmText: "退出训练" },
  );
  if (accepted) await sessionStore.abortTrainingBattle();
}

function getEnemySprite(displayName: string): string {
  if (!displayName) return "";
  for (const creature of CREATURE_KEYS) {
    if (displayName.includes(creature)) {
      const filename = CREATURE_SPRITE_MAP[creature];
      for (const [key, url] of Object.entries(allSprites)) {
        if (key.includes(filename)) {
          return url;
        }
      }
    }
  }
  return "";
}

function getPartyAvatar(player: BattleParticipant): string {
  if (!player.displayName) return "";
  const targetFile = player.characterId === "__player__"
    ? (playerGender.value === "男" ? "男user" : "女user")
    : player.displayName;
  for (const [key, url] of Object.entries(transformedAvatars)) {
    if (key.includes(targetFile)) {
      return url;
    }
  }
  return "";
}

function getPendingEnemySprite(enemy: BattleEnemyInstance): string {
  const challengeSprite = getChallengeBossSprite(enemy.enemyId);
  if (challengeSprite !== "") {
    return challengeSprite;
  }

  // BattleEnemyInstance.displayName is the enemyId, not the real name.
  // Look up the enemy definition from the content registry for creature matching.
  try {
    const enemyDef = getEnemy(enemy.enemyId);
    return getEnemySprite(enemyDef.name);
  } catch {
    return "";
  }
}

function getActiveEnemySprite(enemy: BattleParticipant): string {
  return (
    getChallengeBossSprite(enemy.enemyId) || getEnemySprite(enemy.displayName)
  );
}

function findBattleActionMenuNodeByActionId(
  nodes: BattleActionMenuNode[],
  actionId: BattleActionId,
): BattleActionMenuNode | null {
  for (const node of nodes) {
    if (node.kind === "action" && node.actionId === actionId) {
      return node;
    }

    if (node.children != null) {
      const childMatch = findBattleActionMenuNodeByActionId(
        node.children,
        actionId,
      );

      if (childMatch != null) {
        return childMatch;
      }
    }
  }

  return null;
}

const compactParty = ref(false);
const partyMedia = window.matchMedia("(max-width: 1024px)");
function updatePartyMedia() {
  compactParty.value = partyMedia.matches;
}
onMounted(() => {
  updatePartyMedia();
  partyMedia.addEventListener("change", updatePartyMedia);
});
onBeforeUnmount(() => partyMedia.removeEventListener("change", updatePartyMedia));

const rosterOpen = ref(false);
const lastAllyId = ref<string | null>(null);
const actingAlly = computed(() =>
  activeBattle.value?.phase === "PLAYER_COMMAND" && currentActor.value?.side === "player"
    ? currentActor.value : null,
);
watch(actingAlly, (ally) => {
  if (ally) lastAllyId.value = ally.id;
}, { immediate: true });
watch(() => activeBattle.value?.encounterId, () => { rosterOpen.value = false; });
const foregroundAlly = computed(() =>
  actingAlly.value ?? activePlayers.value.find(player => player.id === lastAllyId.value) ?? activePlayers.value[0],
);
const nextAlly = computed(() => {
  const battle = activeBattle.value;
  const actor = actingAlly.value;
  if (!battle || !actor || battle.pressTurn.ownerSide !== "player" || !battle.pressTurn.icons.length ||
    !actor.isActive || actor.isDown || actor.canAct === false) return null;
  const id = findNextEligibleActorId(battle.pressTurnAllocation?.participantIds ?? [], activePlayers.value, actor.id);
  return id === actor.id ? null : activePlayers.value.find(player => player.id === id) ?? null;
});

function canTargetAlly(player: BattleParticipant): boolean {
  const battle = activeBattle.value;
  if (!canSelectAlly.value || battle?.phase !== "PLAYER_COMMAND" || !battle.selectedActionId) return false;
  if (!player.isDown) return true;
  if (!battle.selectedContentId) return false;
  try {
    return battle.selectedActionId === "basic-skill"
      ? getSkill(battle.selectedContentId).revives === true
      : battle.selectedActionId === "basic-item" && getItem(battle.selectedContentId).revivePercent != null;
  } catch {
    return false;
  }
}

function selectRosterTarget(id: string) {
  const player = activePlayers.value.find(player => player.id === id);
  if (!player || !canTargetAlly(player)) return;
  const logSequence = canonicalBattle.value?.battleLog?.at(-1)?.sequence ?? 0;
  selectTarget(id);
  if ((canonicalBattle.value?.battleLog?.at(-1)?.sequence ?? 0) > logSequence) rosterOpen.value = false;
}
</script>

<template>
  <section
    id="battle-overlay"
    class="battle-overlay battle-overlay--fullscreen"
    role="dialog"
    aria-modal="true"
    aria-label="战斗进行中遮罩"
  >
    <BattleEffectsLayer ref="effectsLayer" />
    <div v-if="overlayMode === 'pending'" class="battle-hud battle-hud--pending">
      <div class="battle-hud__top">
        <section class="battle-status-panel__enemy" aria-label="敌人状态栏">
          <p class="battle-status-panel__label">Incoming</p>
          <h2 class="battle-status-panel__name">战斗即将开始</h2>
          <p v-if="pendingEnemySummaries.length > 0">
            {{ pendingEnemySummaries[0]?.enemyId }}
            <span v-if="pendingEnemySummaries[0]?.count">
              ×{{ pendingEnemySummaries[0].count }}
            </span>
          </p>
        </section>
        <section class="battle-status-panel__turn" aria-label="回合与 Press Turn 区域">
          <p class="battle-status-panel__label">Encounter</p>
          <p class="battle-status-panel__turn-count">
            {{ pendingBattle?.encounterId }}
          </p>
        </section>
      </div>

      <section class="battle-hud__enemy-row" aria-label="敌人区域">
        <button
          v-for="enemy in pendingEnemies"
          :key="enemy.instanceId"
          type="button"
          class="battle-enemy-card battle-enemy-card--pending"
          disabled
        >
          <img
            class="battle-enemy-card__sprite"
            :src="getPendingEnemySprite(enemy)"
            :alt="`${enemy.displayName} sprite`"
          />
          <span class="battle-enemy-card__name">{{ enemy.displayName }}</span>
        </button>
      </section>

      <section class="battle-hud__pending-brief" aria-label="战斗导入">
        <p class="battle-overlay__eyebrow">Battle Pending</p>
        <p v-if="pendingBattle?.narrativeReason" class="battle-overlay__reason">
          {{ pendingBattle.narrativeReason }}
        </p>
        <button
          type="button"
          class="battle-overlay__phase-action battle-overlay__phase-action--primary"
          @click="startPendingBattle"
        >
          开始战斗
        </button>
        <button
          type="button"
          class="battle-overlay__phase-action"
          @click="cancelPendingBattle"
        >
          取消战斗
        </button>
      </section>
    </div>

    <div v-else-if="overlayMode === 'active'" class="battle-hud">
      <div class="battle-hud__top">
        <BattleStatusPanel
          :selected-target="selectedEnemyTarget"
          :turn-count="activeBattle?.turnCount ?? 1"
          :press-turn-icons="activeBattle?.pressTurn.icons ?? []"
          :owner-side="activeBattle?.pressTurn.ownerSide ?? 'player'"
          :icon-assets="pressTurnIconAssets"
        />
      </div>

      <div class="battle-hud__heading">
        <p class="battle-overlay__eyebrow">Battle Active</p>
        <h2 class="battle-overlay__title">
          {{ activeBattle?.phase === "RESULT" ? "战斗结束" : "战斗进行中" }}
        </h2>
        <!-- <div v-if="busy" class="battle-presentation-cue">
          <span class="battle-presentation-cue__text" role="status">{{ actionText }}<small>{{ feedback }}</small></span>
          <button type="button" class="battle-overlay__phase-action" @click="presentation.skip">跳过演出</button>
        </div> -->
        <!-- <p class="battle-overlay__encounter">
          <span>{{ activeBattle?.encounterId }}</span>
          <span>{{ activeBattle?.phase }}</span>
        </p> -->

        <button
          v-if="canExitTraining"
          type="button"
          class="battle-overlay__phase-action"
          @click="exitTraining"
        >
          退出训练
        </button>
      </div>

      <section class="battle-hud__enemy-row" aria-label="敌人区域">
        <div v-for="enemy in activeEnemies" :key="enemy.id" class="battle-enemy-slot" :data-participant-id="enemy.id">
          <button
            type="button"
            class="battle-enemy-card"
            :class="{
              'battle-enemy-card--selected': selectedTarget?.id === enemy.id,
              'battle-enemy-card--down': enemy.isDown,
            }"
            :aria-pressed="selectedTarget?.id === enemy.id"
            :disabled="!canSelectEnemy"
            @click="canSelectEnemy && selectTarget(enemy.id)"
          >
            <img
              class="battle-enemy-card__sprite"
              :src="getActiveEnemySprite(enemy)"
              :alt="`${enemy.displayName} sprite`"
            />
            <span class="battle-enemy-card__name">
              <span class="battle-enemy-card__level">LV {{ enemy.level ?? 1 }}</span>
              {{ enemy.displayName }}
            </span>
            <progress
              class="battle-enemy-card__hp"
              :value="enemy.hp.current"
              :max="enemy.hp.max"
            />
            <span class="battle-enemy-card__hp-nums">HP {{ enemy.hp.current }}/{{ enemy.hp.max }}</span>
          </button>
          <BattleStatusEffects :effects="enemy.statusEffects ?? []" :owner-name="enemy.displayName" />
        </div>
      </section>

      <div class="battle-hud__bottom">
        <BattleCommandMenu
          :action-menu="rootActionMenu"
          :current-menu-node-id="activeBattle?.currentMenuNodeId ?? null"
          :selected-action-id="activeBattle?.selectedActionId ?? null"
          :is-result-phase="activeBattle?.phase === 'RESULT'"
          :is-locked="isCommandMenuLocked"
          :description="selectedActionDescription"
          @select-menu-node="selectMenuNode"
          @return-root="returnToRootMenu"
          @complete-battle="completeBattle"
          @hover-description="onHoverCommandDescription"
        />

        <section class="battle-hud__party-row" aria-label="玩家队伍区域">
          <BattlePartyCard
            v-for="player in activePlayers"
            :key="player.id"
            :player="player"
            :avatar="getPartyAvatar(player)"
            :acting="actingAlly?.id === player.id"
            :targetable="canTargetAlly(player)"
            :class="{
              'battle-party-slot--front': foregroundAlly?.id === player.id,
              'battle-party-slot--next': nextAlly?.id === player.id,
            }"
            :inert="compactParty && foregroundAlly?.id !== player.id"
            :aria-hidden="compactParty && foregroundAlly?.id !== player.id ? true : undefined"
            @select="selectTarget"
          />
          <button
            type="button"
            class="battle-party-stack-trigger"
            aria-label="查看队伍"
            aria-haspopup="dialog"
            @click="presentation.skip(); rosterOpen = true"
          >
            <span>查看队伍 <span aria-hidden="true">↗</span></span>
            <small v-if="nextAlly">顺位 · {{ nextAlly.displayName }}</small>
          </button>
        </section>

        <BattleInspectionDialog v-if="rosterOpen" title="玩家队伍" class="battle-roster-dialog" @close="rosterOpen = false">
          <p v-if="canSelectAlly && activeBattle?.phase === 'PLAYER_COMMAND'" class="battle-roster-hint">{{ targetHintText }}</p>
          <div class="battle-roster-grid">
            <BattlePartyCard
              v-for="player in activePlayers"
              :key="player.id"
              :player="player"
              :avatar="getPartyAvatar(player)"
              :acting="actingAlly?.id === player.id"
              :targetable="canTargetAlly(player)"
              @select="selectRosterTarget"
            />
          </div>
        </BattleInspectionDialog>

        <section
          class="battle-command-description"
          :class="{ 'battle-command-description--hover': hoveredCommandDescription !== null }"
          aria-label="行动描述"
        >
          <p>{{ displayCommandDescription }}</p>
        </section>
        <div class="battle-hud__log-dock">
          <BattleBroadcastWindow
            :entries="activeBattle?.battleLog ?? []"
            :turn-count="activeBattle?.turnCount ?? 1"
          />
        </div>
      </div>

      <!-- ═══ Swap Popup Overlay ═══ -->
      <div v-if="swapPhase !== 'idle'" class="battle-swap-overlay" @click.self="cancelSwap">
        <div class="battle-swap-popup">
          <h3 class="battle-swap-popup__title">{{ targetHintText }}</h3>

          <!-- Phase: select swap-out -->
          <div v-if="swapPhase === 'select_out'" class="battle-swap-popup__cards">
            <button
              v-for="player in swapOutCandidates"
              :key="player.id"
              type="button"
              class="battle-swap-popup__card"
              @click="selectSwapOut(player.id)"
            >
              <img
                class="battle-swap-popup__avatar"
                :src="getPartyAvatar(player)"
                :alt="`${player.displayName} avatar`"
              />
              <span class="battle-swap-popup__name">{{ player.displayName }}</span>
              <span class="battle-swap-popup__hp">HP {{ player.hp.current }}/{{ player.hp.max }}</span>
              <span class="battle-swap-popup__mp">MP {{ player.mp.current }}/{{ player.mp.max }}</span>
            </button>
            <p v-if="swapOutCandidates.length === 0" class="battle-swap-popup__empty">
              没有可以换下的成员
            </p>
          </div>

          <!-- Phase: select swap-in -->
          <div v-if="swapPhase === 'select_in'" class="battle-swap-popup__cards">
            <button
              v-for="player in reservePlayers"
              :key="player.id"
              type="button"
              class="battle-swap-popup__card"
              @click="selectSwapIn(player.id)"
            >
              <span class="battle-swap-popup__name">{{ player.displayName }}</span>
              <span class="battle-swap-popup__hp">HP {{ player.hp.current }}/{{ player.hp.max }}</span>
              <span class="battle-swap-popup__mp">MP {{ player.mp.current }}/{{ player.mp.max }}</span>
              <span class="battle-swap-popup__tag">后备</span>
            </button>
            <p v-if="reservePlayers.length === 0" class="battle-swap-popup__empty">
              没有后备成员
            </p>
          </div>

          <div class="battle-swap-popup__actions">
            <button
              v-if="swapPhase === 'select_in'"
              type="button"
              class="battle-swap-popup__btn battle-swap-popup__btn--skip"
              @click="selectSwapIn(null)"
            >
              仅换下（不上场）
            </button>
            <button
              type="button"
              class="battle-swap-popup__btn battle-swap-popup__btn--cancel"
              @click="cancelSwap"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
