<template>
  <main id="main-game-view" class="main-game-view" role="main">
    <GameTopBar />
    <GameStatusBanner />
    <GameConversationPanel />
    <GameInputDock />
  </main>
</template>

<script setup lang="ts">
import GameConversationPanel from "@/ui/game/GameConversationPanel.vue";
import GameInputDock from "@/ui/game/GameInputDock.vue";
import GameStatusBanner from "@/ui/game/GameStatusBanner.vue";
import GameTopBar from "@/ui/game/GameTopBar.vue";
</script>
