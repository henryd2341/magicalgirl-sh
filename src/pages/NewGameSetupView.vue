<script setup lang="ts">
import { seedRawWorldInfoEntries } from "@/content/rawWorldInfoLoader";
import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import { VariableEngine } from "@/engine/variableEngine";
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const playerName = ref("");
const playerGender = ref<"男" | "女">("女");

async function writeNewGameVariables(
  variableRepository: DbVariableRepository,
): Promise<void> {
  const current =
    (await variableRepository.getCurrent()) ??
    new VariableEngine().createInitialState();
  const patches = [
    {
      path: "player.profile.name",
      value: playerName.value.trim(),
    },
    {
      path: "player.profile.gender",
      value: playerGender.value,
    },
  ];
  const result = new VariableEngine().applyPatchSet({
    current,
    envelope: {
      request_id: "new-game-setup",
      context_version: 1,
      state_hash: current.stateHash,
      tool_call_id: "new-game-setup-initial-profile",
      patches,
    },
  });

  await variableRepository.saveCurrent(result.next);
}

async function confirmNewGame() {
  const persistenceClient = getChatPersistenceClient();
  const chatStore = useChatStore();
  const sessionStore = useSessionStore();

  if (persistenceClient) {
    await persistenceClient.resetCurrentGameData();
    const variableRepository = new DbVariableRepository(persistenceClient);
    const worldInfoRepository = new DbWorldInfoRepository(persistenceClient);
    await seedRawWorldInfoEntries(worldInfoRepository);
    await writeNewGameVariables(variableRepository);
    await syncPlayerGenderWorldInfoActivation({
      variableRepository,
      worldInfoRepository,
    });
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
          v-model="playerName"
          class="new-game-setup-view__input"
          name="player-name"
          type="text"
          placeholder="请输入主角名称"
        />
        <fieldset class="new-game-setup-view__form">
          <legend class="chat-input-box__label">角色性别</legend>
          <label
            class="chat-input-box__label settings-view__checkbox-label"
            for="new-game-player-gender-female"
          >
            <input
              id="new-game-player-gender-female"
              v-model="playerGender"
              name="player-gender"
              type="radio"
              value="女"
            />
            女
          </label>
          <label
            class="chat-input-box__label settings-view__checkbox-label"
            for="new-game-player-gender-male"
          >
            <input
              id="new-game-player-gender-male"
              v-model="playerGender"
              name="player-gender"
              type="radio"
              value="男"
            />
            男
          </label>
        </fieldset>
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
