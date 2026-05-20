<script setup lang="ts">
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import BattleOverlay from "@/ui/battle/BattleOverlay.vue";
import GameConversationPanel from "@/ui/game/GameConversationPanel.vue";
import GameInputDock from "@/ui/game/GameInputDock.vue";
import GameStatusBanner from "@/ui/game/GameStatusBanner.vue";
import GameTopBar from "@/ui/game/GameTopBar.vue";
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const battleStore = useBattleStore();
const { snapshot } = storeToRefs(sessionStore);
const { pendingEncounterId } = storeToRefs(battleStore);

const shouldShowBattleOverlay = computed(() => {
  return (
    snapshot.value.sessionState === "COMBAT_PENDING" &&
    pendingEncounterId.value !== null
  );
});

onMounted(async () => {
  const persistenceClient = getChatPersistenceClient();

  if (persistenceClient) {
    await chatStore.configurePersistence({ client: persistenceClient });
  }

  await chatStore.refreshMessages();
});
</script>

<template>
  <main id="main-game-view" class="main-game-view" role="main">
    <GameTopBar />
    <GameStatusBanner />
    <GameConversationPanel />
    <GameInputDock />
    <BattleOverlay v-if="shouldShowBattleOverlay" />
  </main>
</template>
