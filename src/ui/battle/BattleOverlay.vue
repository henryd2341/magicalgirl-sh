<script setup lang="ts">
import {
  findBattleActionMenuNodeById,
  getBattleActionDefinition,
} from "@/engine/battle/battleActionCatalog";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { BattleActionId, BattleActionMenuNode } from "@/types/battle";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const battleStore = useBattleStore();
const sessionStore = useSessionStore();
const { pendingBattle, activeBattle } = storeToRefs(battleStore);

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

const actionMenu = computed(() => {
  const currentMenuNodeId = activeBattle.value?.currentMenuNodeId;

  if (currentMenuNodeId == null) {
    return rootActionMenu.value;
  }

  const currentMenuNode = findBattleActionMenuNodeById(
    rootActionMenu.value,
    currentMenuNodeId,
  );

  return currentMenuNode?.children ?? rootActionMenu.value;
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
  return selectedAction.value?.description ?? "行动描述框";
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

async function completeBattle() {
  await sessionStore.completeActiveBattle();
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
    class="battle-overlay scrapbook-panel"
    role="dialog"
    aria-modal="true"
    aria-label="战斗进行中遮罩"
  >
    <div v-if="overlayMode === 'pending'" class="battle-overlay__content">
      <p class="battle-overlay__eyebrow">Battle Pending</p>
      <h2 class="battle-overlay__title">战斗即将开始</h2>
      <p class="battle-overlay__encounter">
        <span class="battle-overlay__label">Encounter:</span>
        <span>{{ pendingBattle?.encounterId }}</span>
      </p>
      <p v-if="pendingBattle?.narrativeReason" class="battle-overlay__reason">
        {{ pendingBattle.narrativeReason }}
      </p>
      <ul
        v-if="pendingEnemySummaries.length > 0"
        class="battle-overlay__enemy-list"
      >
        <li
          v-for="enemy in pendingEnemySummaries"
          :key="enemy.enemyId"
          class="battle-overlay__enemy-item"
        >
          <span>{{ enemy.enemyId }}</span>
          <span>×{{ enemy.count }}</span>
        </li>
      </ul>
    </div>

    <div v-else-if="overlayMode === 'active'" class="battle-overlay__content">
      <p class="battle-overlay__eyebrow">Battle Active</p>
      <h2 class="battle-overlay__title">
        {{ activeBattle?.phase === "RESULT" ? "战斗结束" : "战斗进行中" }}
      </h2>
      <p class="battle-overlay__encounter">
        <span class="battle-overlay__label">Encounter:</span>
        <span>{{ activeBattle?.encounterId }}</span>
      </p>
      <p class="battle-overlay__phase">
        <span class="battle-overlay__label">Phase:</span>
        <span>{{ activeBattle?.phase }}</span>
      </p>

      <section aria-label="回合与 Press Turn 区域">
        <h3>Turn Counts</h3>
        <p>{{ activeBattle?.turnCount ?? 1 }}</p>
        <h3>Press Turn Icons</h3>
        <p>
          {{ activeBattle?.pressTurn.icons ?? 0 }}
        </p>
      </section>

      <section aria-label="敌人区域">
        <h3>Enemies</h3>
        <ul>
          <li v-for="enemy in activeEnemies" :key="enemy.id">
            <button
              type="button"
              :aria-pressed="selectedTarget?.id === enemy.id"
              @click="selectTarget(enemy.id)"
            >
              <span>Enemy Sprite Placeholder</span>
              <span>{{ enemy.displayName }}</span>
            </button>
          </li>
        </ul>

        <div v-if="selectedTarget !== null">
          <p>Selected Target</p>
          <p>LV {{ selectedTarget.level ?? 1 }}</p>
          <p>{{ selectedTarget.displayName }}</p>
          <progress
            :value="selectedTarget.hp.current"
            :max="selectedTarget.hp.max"
          />
        </div>
      </section>

      <section aria-label="玩家队伍区域">
        <h3>Players</h3>
        <ul>
          <li v-for="player in activePlayers" :key="player.id">
            <p>Portrait Placeholder</p>
            <p>{{ player.displayName }}</p>
            <p>HP {{ player.hp.current }}/{{ player.hp.max }}</p>
            <p>MP {{ player.mp.current }}/{{ player.mp.max }}</p>
            <p>
              {{
                player.statusEffects?.length
                  ? player.statusEffects.join(", ")
                  : "正常"
              }}
            </p>
            <p v-if="currentActor?.id === player.id">当前行动者</p>
          </li>
        </ul>
      </section>

      <section aria-label="行动指令区域">
        <h3>Actions</h3>
        <button
          v-if="activeBattle?.phase === 'RESULT'"
          type="button"
          @click="completeBattle"
        >
          完成战斗
        </button>
        <ul v-else>
          <li v-for="action in actionMenu" :key="action.id">
            <button
              type="button"
              :aria-pressed="action.kind === 'action' && selectedAction?.id === action.id"
              @click="selectMenuNode(action.id)"
            >
              {{ action.label }}
            </button>
          </li>
        </ul>
        <p>{{ selectedActionDescription }}</p>
      </section>
    </div>
  </section>
</template>
