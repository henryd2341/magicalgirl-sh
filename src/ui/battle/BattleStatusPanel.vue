<script setup lang="ts">
import type { BattleParticipant, CombatantSide, PressTurnIcon } from "@/types/battle";

defineProps<{
  selectedTarget: BattleParticipant | null;
  turnCount: number;
  pressTurnIcons: PressTurnIcon[];
  ownerSide: CombatantSide;
  iconAssets: Record<string, { solid: string; bright: string }>;
}>();
</script>

<template>
  <div class="battle-status-panel">
    <section class="battle-status-panel__enemy" aria-label="敌人状态栏">
      <p class="battle-status-panel__label">Target</p>
      <template v-if="selectedTarget">
        <p class="battle-status-panel__level">
          LV {{ selectedTarget.level ?? 1 }}
        </p>
        <h3 class="battle-status-panel__name">
          {{ selectedTarget.displayName }}
        </h3>
        <progress
          class="battle-status-panel__hp"
          :value="selectedTarget.hp.current"
          :max="selectedTarget.hp.max"
        />
      </template>
      <p v-else class="battle-status-panel__empty">No target</p>
    </section>

    <section class="battle-status-panel__turn" aria-label="回合与 Press Turn 区域">
      <div>
        <p class="battle-status-panel__label">Turn</p>
        <p class="battle-status-panel__turn-count">Turn {{ turnCount }}</p>
      </div>
      <ol class="battle-status-panel__icons" aria-label="Press Turn Icons">
        <li
          v-for="icon in pressTurnIcons"
          :key="icon.id"
          class="battle-status-panel__icon"
          :class="`battle-status-panel__icon--${icon.state}`"
          :aria-label="`${icon.state} press turn icon`"
        >
          <img
            :src="iconAssets[ownerSide].solid"
            class="battle-status-panel__icon-img"
            :alt="`${ownerSide} press turn`"
          />
          <img
            v-if="icon.state === 'blinking'"
            :src="iconAssets[ownerSide].bright"
            class="battle-status-panel__icon-img battle-status-panel__icon-img--bright"
            alt=""
            aria-hidden="true"
          />
        </li>
      </ol>
    </section>
  </div>
</template>
