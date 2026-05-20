<script setup lang="ts">
import { useBattleStore } from "@/stores/battleStore";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const battleStore = useBattleStore();
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

const overlayMode = computed(() => {
  if (activeBattle.value !== null) {
    return "active";
  }

  if (pendingBattle.value !== null) {
    return "pending";
  }

  return "empty";
});
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
      <h2 class="battle-overlay__title">战斗进行中</h2>
      <p class="battle-overlay__encounter">
        <span class="battle-overlay__label">Encounter:</span>
        <span>{{ activeBattle?.encounterId }}</span>
      </p>
      <p class="battle-overlay__phase">
        <span class="battle-overlay__label">Phase:</span>
        <span>{{ activeBattle?.phase }}</span>
      </p>
      <ul
        v-if="activeParticipants.length > 0"
        class="battle-overlay__participant-list"
      >
        <li
          v-for="participant in activeParticipants"
          :key="participant.id"
          class="battle-overlay__participant-item"
        >
          <span>{{ participant.displayName }}</span>
          <span>{{ participant.side }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
