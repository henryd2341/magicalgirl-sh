<script setup lang="ts">
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useRouter } from "vue-router";

const router = useRouter();

async function confirmNewGame() {
  const persistenceClient = getChatPersistenceClient();
  const chatStore = useChatStore();
  const sessionStore = useSessionStore();

  if (persistenceClient) {
    await persistenceClient.resetCurrentGameData();
    await chatStore.configurePersistence({ client: persistenceClient });
    await sessionStore.configurePersistence({ client: persistenceClient });
  } else {
    chatStore.resetToInMemoryPersistence();
  }

  await router.push({ name: "game" });
}

async function cancelNewGame() {
  await router.push({ name: "title" });
}
</script>

<template>
  <main
    id="new-game-setup-view"
    class="new-game-setup-view scrapbook-panel"
    role="main"
  >
    <section class="new-game-setup-view__panel">
      <p class="eyebrow eyebrow--blue">New Game Setup</p>
      <h1 class="section-heading--playful">新游戏初始化</h1>
      <form class="new-game-setup-view__form">
        <label class="chat-input-box__label" for="new-game-player-name">角色姓名</label>
        <input
          id="new-game-player-name"
          class="new-game-setup-view__input"
          name="player-name"
          type="text"
          placeholder="请输入主角名称"
        />
        <div class="new-game-setup-view__actions">
          <button
            id="new-game-confirm-start"
            class="primary-cta"
            type="button"
            @click="confirmNewGame"
          >
            确认并进入主游戏
          </button>
          <button
            id="new-game-cancel"
            class="secondary-cta"
            type="button"
            @click="cancelNewGame"
          >
            取消
          </button>
        </div>
      </form>
    </section>
  </main>
</template>
