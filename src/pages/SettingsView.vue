<script setup lang="ts">
import {
  createDefaultPromptPresetConfig,
  getPromptPresetRepository,
  type PromptPresetConfig,
} from "@/orchestrator/promptPreset";
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const repository = getPromptPresetRepository();
const statusMessage = ref("");
const form = reactive<PromptPresetConfig>(
  createDefaultPromptPresetConfig(),
);

async function returnToGame() {
  await router.push({ name: "game" });
}

function applyConfig(config: PromptPresetConfig): void {
  form.systemPrompt = config.systemPrompt;
  form.budget.maxTotalTokens = config.budget.maxTotalTokens;
  form.budget.maxWorldInfoEntries = config.budget.maxWorldInfoEntries;
  form.budget.maxHistoryMessages = config.budget.maxHistoryMessages;
  form.updatedAt = config.updatedAt;
}

async function savePromptPreset() {
  await repository.saveCurrent({
    systemPrompt: form.systemPrompt,
    budget: {
      maxTotalTokens: Number(form.budget.maxTotalTokens),
      maxWorldInfoEntries: Number(form.budget.maxWorldInfoEntries),
      maxHistoryMessages: Number(form.budget.maxHistoryMessages),
    },
    updatedAt: form.updatedAt,
  });
  applyConfig(await repository.getCurrent());
  statusMessage.value = "Prompt 设置已保存。";
}

async function resetPromptPreset() {
  applyConfig(await repository.resetToDefault());
  statusMessage.value = "Prompt 设置已恢复默认。";
}

onMounted(async () => {
  applyConfig(await repository.getCurrent());
});
</script>

<template>
  <main id="settings-view" class="settings-view scrapbook-panel" role="main">
    <section class="settings-view__panel">
      <p class="eyebrow eyebrow--blue">Prompt Builder</p>
      <h1 class="section-heading--playful">设置 / Prompt Builder</h1>
      <form class="settings-view__form" @submit.prevent="savePromptPreset">
        <label class="chat-input-box__label" for="prompt-system-prompt">
          System Prompt
        </label>
        <textarea
          id="prompt-system-prompt"
          v-model="form.systemPrompt"
          class="settings-view__textarea"
          rows="12"
        />

        <div class="settings-view__budget-grid">
          <label class="chat-input-box__label" for="prompt-max-total-tokens">
            最大总 token
            <input
              id="prompt-max-total-tokens"
              v-model.number="form.budget.maxTotalTokens"
              class="settings-view__number-input"
              type="number"
              min="1"
            />
          </label>
          <label
            class="chat-input-box__label"
            for="prompt-max-world-info-entries"
          >
            最大 world_info 条目
            <input
              id="prompt-max-world-info-entries"
              v-model.number="form.budget.maxWorldInfoEntries"
              class="settings-view__number-input"
              type="number"
              min="0"
            />
          </label>
          <label class="chat-input-box__label" for="prompt-max-history-messages">
            最大历史消息数
            <input
              id="prompt-max-history-messages"
              v-model.number="form.budget.maxHistoryMessages"
              class="settings-view__number-input"
              type="number"
              min="0"
            />
          </label>
        </div>

        <section class="settings-view__mustache" aria-label="Mustache 变量说明">
          <p>可用变量：</p>
          <code v-text="'{{user}}'" />
          <code v-text="'{{world.location.name}}'" />
          <code v-text="'{{user|default=鹿目真昼}}'" />
          <code v-text="'{{user ?? 鹿目真昼}}'" />
        </section>

        <p v-if="statusMessage" role="status">{{ statusMessage }}</p>

        <div class="settings-view__actions">
          <button
            id="settings-save-prompt-preset"
            class="primary-cta"
            type="submit"
          >
            保存 Prompt 设置
          </button>
          <button
            id="settings-reset-prompt-preset"
            class="secondary-cta"
            type="button"
            @click="resetPromptPreset"
          >
            恢复默认
          </button>
        </div>
      </form>
      <div class="settings-view__actions">
        <button
          id="settings-return-game"
          class="secondary-cta"
          type="button"
          @click="returnToGame"
        >
          返回主游戏
        </button>
      </div>
    </section>
  </main>
</template>
