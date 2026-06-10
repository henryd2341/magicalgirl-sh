<script setup lang="ts">
import { buildPlayerPartyFromFormation } from "@/engine/battle/battleSetup";
import { useBattleStore } from "@/stores/battleStore";
import { useFormationStore } from "@/stores/formationStore";
import { useSessionStore } from "@/stores/sessionStore";
import { ref } from "vue";

const sessionStore = useSessionStore();
const battleStore = useBattleStore();
const formationStore = useFormationStore();

const isStarting = ref(false);

async function handleStartBattle() {
  if (isStarting.value) return;
  isStarting.value = true;

  try {
    const vars = await sessionStore.getVariableSnapshot();
    if (!vars?.root) {
      console.warn("[PendingBattleBar] No variable state — cannot start battle.");
      return;
    }

    const formation = await formationStore.getFormation();
    const playerParty = buildPlayerPartyFromFormation(
      vars.root,
      formation.vanguard,
    );
    await sessionStore.startBattle(playerParty);
  } finally {
    isStarting.value = false;
  }
}
</script>

<template>
  <section id="pending-battle-bar" class="mg-pending-battle">
    <button
      class="mg-btn mg-btn--primary mg-btn--lg mg-pending-battle__btn"
      :disabled="isStarting"
      @click="handleStartBattle"
    >
      <i class="fas fa-crosshairs"></i>
      {{ isStarting ? "准备中..." : "进入战斗" }}
    </button>
  </section>
</template>

<style scoped>
.mg-pending-battle {
  display: flex;
  justify-content: center;
  padding: 12px 16px;
}
.mg-pending-battle__btn {
  min-width: 200px;
}
</style>
