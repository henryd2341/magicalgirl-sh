<script setup lang="ts">
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { useChatStore } from "@/stores/chatStore";
import GameConversationPanel from "@/ui/game/GameConversationPanel.vue";
import GameInputDock from "@/ui/game/GameInputDock.vue";
import GameStatusBanner from "@/ui/game/GameStatusBanner.vue";
import GameTopBar from "@/ui/game/GameTopBar.vue";
import { onMounted } from "vue";

const chatStore = useChatStore();

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
  </main>
</template>
