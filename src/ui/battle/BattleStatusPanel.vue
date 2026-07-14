<script setup lang="ts">
import type { BossPublicSignal } from "@/engine/battle/boss/bossTypes";
import type { BattleParticipant, CombatantSide, PressTurnIcon } from "@/types/battle";

defineProps<{
  selectedTarget: BattleParticipant | null;
  turnCount: number;
  pressTurnIcons: PressTurnIcon[];
  ownerSide: CombatantSide;
  iconAssets: Record<string, { solid: string; bright: string }>;
  bossSignals?: BossPublicSignal[];
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

    <section
      v-if="bossSignals?.length"
      class="battle-status-panel__boss-signals"
      aria-label="Boss 公开机制"
    >
      <p class="battle-status-panel__label">Boss Signals</p>
      <ul>
        <li
          v-for="signal in bossSignals"
          :key="signal.id"
          :class="`battle-status-panel__boss-signal--${signal.urgency}`"
        >
          <strong>{{ signal.label }}</strong><span>{{ signal.value }}</span>
        </li>
      </ul>
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


<style scoped>
.battle-status-panel__boss-signals { min-width: 14rem; padding: .35rem .7rem; }
.battle-status-panel__boss-signals ul { display: grid; gap: .2rem; margin: 0; padding: 0; list-style: none; }
.battle-status-panel__boss-signals li { display: flex; justify-content: space-between; gap: .75rem; font-size: .75rem; }
.battle-status-panel__boss-signal--warning { color: #ffd88a; }
.battle-status-panel__boss-signal--danger { color: #ff9d9d; }
</style>
