<script setup lang="ts">
import { useBattleStore } from "@/stores/battleStore";
import { storeToRefs } from "pinia";

const battleStore = useBattleStore();
const { pendingEncounterId, lastNarrativeReason } = storeToRefs(battleStore);
</script>

<template>
  <section
    id="battle-overlay"
    class="battle-overlay scrapbook-panel"
    role="dialog"
    aria-modal="true"
    aria-label="战斗进行中遮罩"
  >
    <div class="battle-overlay__content">
      <p class="battle-overlay__eyebrow">Battle Pending</p>
      <h2 class="battle-overlay__title">战斗即将开始</h2>
      <p class="battle-overlay__encounter">
        <span class="battle-overlay__label">Encounter:</span>
        <span>{{ pendingEncounterId }}</span>
      </p>
      <p v-if="lastNarrativeReason" class="battle-overlay__reason">
        {{ lastNarrativeReason }}
      </p>
    </div>
  </section>
</template>
