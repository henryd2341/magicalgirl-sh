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
import PromptViewerDrawer from "@/ui/dev/PromptViewerDrawer.vue";
import PostCombatPanel from "@/ui/session/PostCombatPanel.vue";
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const battleStore = useBattleStore();
const { snapshot } = storeToRefs(sessionStore);
const { pendingBattle, activeBattle } = storeToRefs(battleStore);

const shouldShowBattleOverlay = computed(() => {
  const isPendingBattleVisible =
    snapshot.value.sessionState === "COMBAT_PENDING" &&
    pendingBattle.value !== null;

  const isActiveBattleVisible =
    snapshot.value.sessionState === "IN_COMBAT" && activeBattle.value !== null;

  return isPendingBattleVisible || isActiveBattleVisible;
});

const shouldShowPostCombatPanel = computed(() => {
  return snapshot.value.sessionState === "POST_COMBAT_READY";
});

function launchDebugBattleForTestingOnly() {
  battleStore.stagePendingEncounter({
    encounterId: "enc-main-game-debug-battle",
    narrativeReason: "测试用预置战斗入口，后续应删除。",
    enemies: [{ enemy_id: "debug-shadow", count: 1 }],
  });

  sessionStore.enterCombatPending();
  sessionStore.startBattle([
    {
      id: "player-heroine-1",
      side: "player",
      displayName: "鹿目真昼",
      hp: {
        current: 120,
        max: 120,
      },
      mp: {
        current: 48,
        max: 48,
      },
      isDown: false,
      isActive: true,
    },
  ]);
}

onMounted(async () => {
  const persistenceClient = getChatPersistenceClient();

  if (persistenceClient) {
    await chatStore.configurePersistence({ client: persistenceClient });
    await sessionStore.configurePersistence({ client: persistenceClient });
    await sessionStore.recoverFromInterruptedCombat();
  }

  await chatStore.refreshMessages();
});
</script>

<template>
  <main id="main-game-view" class="main-game-view" role="main">
    <GameTopBar />
    <GameStatusBanner />
    <GameConversationPanel />
    <PostCombatPanel v-if="shouldShowPostCombatPanel" />
    <GameInputDock />
    <PromptViewerDrawer />
    <button type="button" @click="launchDebugBattleForTestingOnly">
      测试用：启动预置战斗
    </button>
    <BattleOverlay v-if="shouldShowBattleOverlay" />
  </main>
</template>
