<script setup lang="ts">
import {
  findBattleActionMenuNodeById,
  getBattleActionDefinition,
} from "@/engine/battle/battleActionCatalog";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import avatarHeroine from "@/assets/avatars/heroine_1_transformed.png";
import spriteOne from "@/assets/sprites/1.png";
import spriteTwo from "@/assets/sprites/2.png";
import type {
  BattleActionId,
  BattleActionMenuNode,
  BattleEnemyInstance,
  BattleParticipant,
} from "@/types/battle";
import BattleCommandMenu from "@/ui/battle/BattleCommandMenu.vue";
import BattleStatusPanel from "@/ui/battle/BattleStatusPanel.vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const battleStore = useBattleStore();
const sessionStore = useSessionStore();
const { pendingBattle, activeBattle } = storeToRefs(battleStore);
const enemySprites = [spriteOne, spriteTwo];
const partyAvatars = [avatarHeroine];

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
  const target =
    activeParticipants.value.find(
      (participant) => participant.id === activeBattle.value?.selectedTargetId,
    ) ??
    activeEnemies.value[0] ??
    null;

  if (target == null) {
    return null;
  }

  if (
    selectedActionDefinition.value?.selectionMode === "selective" &&
    !selectedActionDefinition.value.allowedSides.includes(target.side)
  ) {
    return null;
  }

  return target;
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
  battleStore.selectTarget(targetId);
}

function selectMenuNode(nodeId: string) {
  battleStore.selectMenuNode(nodeId);
}

function returnToRootMenu() {
  battleStore.returnToRootMenu();
}

async function completeBattle() {
  await sessionStore.completeActiveBattle();
}

function getEnemySprite(index: number): string {
  return enemySprites[index % enemySprites.length] ?? spriteOne;
}

function getPartyAvatar(index: number): string {
  return partyAvatars[index % partyAvatars.length] ?? avatarHeroine;
}

function getPendingEnemySprite(enemy: BattleEnemyInstance, index: number): string {
  return getEnemySprite(index + enemy.enemyId.length);
}

function getActiveEnemySprite(
  _enemy: BattleParticipant,
  index: number,
): string {
  return getEnemySprite(index);
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
</script>

<template>
  <section
    id="battle-overlay"
    class="battle-overlay battle-overlay--fullscreen"
    role="dialog"
    aria-modal="true"
    aria-label="战斗进行中遮罩"
  >
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
          v-for="(enemy, index) in pendingEnemies"
          :key="enemy.instanceId"
          type="button"
          class="battle-enemy-card battle-enemy-card--pending"
          disabled
        >
          <img
            class="battle-enemy-card__sprite"
            :src="getPendingEnemySprite(enemy, index)"
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
      </section>
    </div>

    <div v-else-if="overlayMode === 'active'" class="battle-hud">
      <div class="battle-hud__top">
        <BattleStatusPanel
          :selected-target="selectedEnemyTarget"
          :turn-count="activeBattle?.turnCount ?? 1"
          :press-turn-icons="activeBattle?.pressTurn.icons ?? []"
        />
      </div>

      <div class="battle-hud__heading">
        <p class="battle-overlay__eyebrow">Battle Active</p>
        <h2 class="battle-overlay__title">
          {{ activeBattle?.phase === "RESULT" ? "战斗结束" : "战斗进行中" }}
        </h2>
        <p class="battle-overlay__encounter">
          <span>{{ activeBattle?.encounterId }}</span>
          <span>{{ activeBattle?.phase }}</span>
        </p>
      </div>

      <section class="battle-hud__enemy-row" aria-label="敌人区域">
        <button
          v-for="(enemy, index) in activeEnemies"
          :key="enemy.id"
          type="button"
          class="battle-enemy-card"
          :class="{
            'battle-enemy-card--selected': selectedTarget?.id === enemy.id,
            'battle-enemy-card--down': enemy.isDown,
          }"
          :aria-pressed="selectedTarget?.id === enemy.id"
          @click="selectTarget(enemy.id)"
        >
          <img
            class="battle-enemy-card__sprite"
            :src="getActiveEnemySprite(enemy, index)"
            :alt="`${enemy.displayName} sprite`"
          />
          <span class="battle-enemy-card__level">LV {{ enemy.level ?? 1 }}</span>
          <span class="battle-enemy-card__name">{{ enemy.displayName }}</span>
          <progress
            class="battle-enemy-card__hp"
            :value="enemy.hp.current"
            :max="enemy.hp.max"
          />
        </button>
      </section>

      <div class="battle-hud__bottom">
        <BattleCommandMenu
          :action-menu="rootActionMenu"
          :current-menu-node-id="activeBattle?.currentMenuNodeId ?? null"
          :selected-action-id="activeBattle?.selectedActionId ?? null"
          :is-result-phase="activeBattle?.phase === 'RESULT'"
          :description="selectedActionDescription"
          @select-menu-node="selectMenuNode"
          @return-root="returnToRootMenu"
          @complete-battle="completeBattle"
        />

        <section class="battle-hud__party-row" aria-label="玩家队伍区域">
          <article
            v-for="(player, index) in activePlayers"
            :key="player.id"
            class="battle-party-card"
            :class="{
              'battle-party-card--actor': currentActor?.id === player.id,
              'battle-party-card--down': player.isDown,
            }"
          >
            <img
              class="battle-party-card__avatar"
              :src="getPartyAvatar(index)"
              :alt="`${player.displayName} avatar`"
            />
            <div class="battle-party-card__body">
              <p class="battle-party-card__name">{{ player.displayName }}</p>
              <p class="battle-party-card__stat">
                HP {{ player.hp.current }}/{{ player.hp.max }}
              </p>
              <p class="battle-party-card__stat">
                MP {{ player.mp.current }}/{{ player.mp.max }}
              </p>
              <p class="battle-party-card__status">
                {{
                  player.statusEffects?.length
                    ? player.statusEffects.join(", ")
                    : "正常"
                }}
              </p>
              <p
                v-if="currentActor?.id === player.id"
                class="battle-party-card__actor"
              >
                当前行动者
              </p>
            </div>
          </article>
        </section>
      </div>
    </div>
  </section>
</template>
