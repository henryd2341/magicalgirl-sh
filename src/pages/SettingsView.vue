<script setup lang="ts">
import { syncRawWorldInfoEntries } from "@/content/rawWorldInfoLoader";
import { VariableEngine } from "@/engine/variableEngine";
import { renderMustacheTemplate } from "@/orchestrator/mustacheTemplate";
import {
  createDefaultPromptPresetConfig,
  getPromptPresetRepository,
  DEFAULT_CHAIN_OF_THOUGHT_CONFIG,
  COT_TEMPLATE_PRESETS,
  type PromptPresetConfig,
} from "@/orchestrator/promptPreset";
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import {
  DbWorldInfoRepository,
  type WorldInfoEntry,
} from "@/persistence/repositories/worldInfoRepository";
import { useSkillStore } from "@/stores/skillStore";
import SkillSettingsPanel from "@/ui/settings/SkillSettingsPanel.vue";
import type { VariableValueRecord } from "@/types/variables";
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const repository = getPromptPresetRepository();
const skillStore = useSkillStore();
const statusMessage = ref("");
const activeTab = ref<"prompt" | "skills" | "cot">("prompt");
const variableState = ref<VariableValueRecord>(
  new VariableEngine().createInitialState(),
);
const worldInfoRows = ref<EditableWorldInfoEntry[]>([]);
const form = reactive<PromptPresetConfig>(
  createDefaultPromptPresetConfig(),
);

interface EditableWorldInfoEntry extends WorldInfoEntry {
  keywordsText: string;
  expanded: boolean;
}

const returnToGame = () => emit("close");

function applyConfig(config: PromptPresetConfig): void {
  form.systemPrompt = config.systemPrompt;
  form.maxTotalTokens = config.maxTotalTokens;
  form.previewMustacheVariables = config.previewMustacheVariables;
  form.updatedAt = config.updatedAt;
  form.customChainOfThought = config.customChainOfThought
    ?? { ...DEFAULT_CHAIN_OF_THOUGHT_CONFIG };
}

function toEditableWorldInfoEntry(entry: WorldInfoEntry): EditableWorldInfoEntry {
  return {
    ...entry,
    keywordsText: entry.keywords.join(", "),
    expanded: false,
  };
}

function sortEditableEntries(
  entries: EditableWorldInfoEntry[],
): EditableWorldInfoEntry[] {
  return [...entries].sort((left, right) => {
    const priorityDelta = right.priority - left.priority;
    return priorityDelta === 0
      ? left.id.localeCompare(right.id)
      : priorityDelta;
  });
}

function parseKeywords(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\n,，]+/)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0),
    ),
  ];
}

function toWorldInfoEntry(row: EditableWorldInfoEntry): WorldInfoEntry {
  return {
    id: row.id,
    keywords: parseKeywords(row.keywordsText),
    content: row.content,
    priority: row.priority,
    enabled: row.enabled,
    isConstant: row.isConstant,
  };
}

async function loadWorldInfoEntries(): Promise<void> {
  const client = getChatPersistenceClient();
  if (!client) {
    worldInfoRows.value = [];
    return;
  }

  const repository = new DbWorldInfoRepository(client);
  const entries = await syncRawWorldInfoEntries(repository);
  worldInfoRows.value = sortEditableEntries(
    entries.map(toEditableWorldInfoEntry),
  );
}

async function loadVariableState(): Promise<void> {
  const client = getChatPersistenceClient();
  if (!client) {
    variableState.value = new VariableEngine().createInitialState();
    return;
  }

  variableState.value =
    (await new DbVariableRepository(client).getCurrent()) ??
    new VariableEngine().createInitialState();
}

function moveWorldInfoEntry(index: number, direction: -1 | 1): void {
  const targetIndex = index + direction;
  const current = worldInfoRows.value[index];
  const target = worldInfoRows.value[targetIndex];
  if (!current || !target) {
    return;
  }

  const currentPriority = current.priority;
  current.priority = target.priority;
  target.priority = currentPriority;
  worldInfoRows.value = sortEditableEntries(worldInfoRows.value);
}

function toggleWorldInfoContent(row: EditableWorldInfoEntry): void {
  row.expanded = !row.expanded;
}

const mustachePreview = computed(() =>
  renderMustacheTemplate(form.systemPrompt, variableState.value),
);

async function savePromptPreset() {
  await repository.saveCurrent({
    systemPrompt: form.systemPrompt,
    maxTotalTokens: Number(form.maxTotalTokens),
    previewMustacheVariables: form.previewMustacheVariables,
    updatedAt: form.updatedAt,
    customChainOfThought: form.customChainOfThought,
  });
  const client = getChatPersistenceClient();
  if (client) {
    const worldInfoRepository = new DbWorldInfoRepository(client);
    for (const row of worldInfoRows.value) {
      await worldInfoRepository.save(toWorldInfoEntry(row));
    }
  }
  applyConfig(await repository.getCurrent());
  await loadWorldInfoEntries();
  statusMessage.value = "Prompt 设置已保存。";
}

async function resetPromptPreset() {
  applyConfig(await repository.resetToDefault());
  statusMessage.value = "Prompt 设置已恢复默认。";
}

function onCotStyleChange(): void {
  form.customChainOfThought.template =
    COT_TEMPLATE_PRESETS[form.customChainOfThought.style];
}

onMounted(async () => {
  applyConfig(await repository.getCurrent());
  skillStore.loadSkills();
  await Promise.all([loadWorldInfoEntries(), loadVariableState()]);
});
</script>

<template>
  <main id="settings-view" class="settings-view scrapbook-panel" role="main">
    <section class="settings-view__panel">
      <p class="eyebrow eyebrow--blue">Settings</p>
      <h1 class="section-heading--playful">设置</h1>

      <nav class="settings-view__tabs" aria-label="设置分类">
        <button
          class="secondary-cta"
          :class="{ 'primary-cta': activeTab === 'prompt' }"
          type="button"
          @click="activeTab = 'prompt'"
        >
          Prompt Builder
        </button>
        <button
          class="secondary-cta"
          :class="{ 'primary-cta': activeTab === 'skills' }"
          type="button"
          @click="activeTab = 'skills'"
        >
          技能 (Skills)
        </button>
        <button
          class="secondary-cta"
          :class="{ 'primary-cta': activeTab === 'cot' }"
          type="button"
          @click="activeTab = 'cot'"
        >
          自定义思维链
        </button>
      </nav>

      <template v-if="activeTab === 'prompt'">
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
                v-model.number="form.maxTotalTokens"
                class="settings-view__number-input"
                type="number"
                min="1"
              />
            </label>
            <label
              class="chat-input-box__label settings-view__checkbox-label"
              for="prompt-prerender-mustache-variables"
            >
              <input
                id="prompt-prerender-mustache-variables"
                v-model="form.previewMustacheVariables"
                type="checkbox"
              />
              预渲染 Mustache Var
            </label>
          </div>

          <section class="settings-view__mustache" aria-label="Mustache 变量说明">
            <p>可用变量：</p>
            <code v-text="'{{user}}'" />
            <code v-text="'{{world.location.name}}'" />
            <code v-text="'{{user|default=鹿目真昼}}'" />
            <code v-text="'{{user ?? 鹿目真昼}}'" />
          </section>

          <section
            v-if="form.previewMustacheVariables"
            class="settings-view__mustache-preview"
            aria-label="Mustache 预渲染结果"
          >
            <pre class="settings-view__pre">{{ mustachePreview.text }}</pre>
            <ul class="settings-view__resolution-list">
              <li
                v-for="resolution in mustachePreview.resolutions"
                :key="resolution.token"
              >
                <code>{{ resolution.token }}</code>
                <span>{{ resolution.resolvedPath }}</span>
                <span>{{ resolution.status }}</span>
                <strong>{{ resolution.value ?? "null" }}</strong>
              </li>
            </ul>
          </section>

          <section class="settings-view__world-info" aria-label="world_info 条目">
            <h2 class="settings-view__subheading">world_info 条目</h2>
            <p v-if="worldInfoRows.length === 0" class="settings-view__empty">
              当前没有可编辑的 world_info 条目。
            </p>
            <article
              v-for="(entry, index) in worldInfoRows"
              :key="entry.id"
              class="settings-view__world-info-item"
            >
              <header class="settings-view__world-info-header">
                <strong>{{ entry.id }}</strong>
                <span>priority: {{ entry.priority }}</span>
              </header>
              <label
                class="chat-input-box__label settings-view__checkbox-label"
                :for="`world-info-${index}-constant`"
              >
                <input
                  :id="`world-info-${index}-constant`"
                  v-model="entry.isConstant"
                  type="checkbox"
                />
                {{ entry.id }} 常驻
              </label>
              <label
                class="chat-input-box__label settings-view__checkbox-label"
                :for="`world-info-${index}-enabled`"
              >
                <input
                  :id="`world-info-${index}-enabled`"
                  v-model="entry.enabled"
                  type="checkbox"
                />
                {{ entry.id }} 启用
              </label>
              <label
                class="chat-input-box__label"
                :for="`world-info-${index}-keywords`"
              >
                {{ entry.id }} 关键词
                <input
                  :id="`world-info-${index}-keywords`"
                  v-model="entry.keywordsText"
                  class="settings-view__text-input"
                  type="text"
                />
              </label>
              <div class="settings-view__world-info-actions">
                <button
                  class="secondary-cta"
                  type="button"
                  :disabled="index === 0"
                  @click="moveWorldInfoEntry(index, -1)"
                >
                  上移
                </button>
                <button
                  class="secondary-cta"
                  type="button"
                  :disabled="index === worldInfoRows.length - 1"
                  @click="moveWorldInfoEntry(index, 1)"
                >
                  下移
                </button>
                <button
                  class="secondary-cta"
                  type="button"
                  @click="toggleWorldInfoContent(entry)"
                >
                  {{ entry.expanded ? "隐藏正文" : "查看正文" }}
                </button>
              </div>
              <pre v-if="entry.expanded" class="settings-view__pre">{{
                entry.content
              }}</pre>
            </article>
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
      </template>

      <SkillSettingsPanel v-if="activeTab === 'skills'" />

      <template v-if="activeTab === 'cot'">
        <form class="settings-view__form" @submit.prevent="savePromptPreset">
          <label class="chat-input-box__label settings-view__checkbox-label" for="cot-enabled">
            <input
              id="cot-enabled"
              v-model="form.customChainOfThought.enabled"
              type="checkbox"
            />
            启用自定义思维链
          </label>

          <p v-if="form.customChainOfThought.enabled" class="settings-view__hint">
            在每次 AI 请求中动态注入思维链引导提示词。
            模板中使用 <code> userInput </code> 代表玩家输入的位置。
          </p>

          <template v-if="form.customChainOfThought.enabled">
            <div class="settings-view__budget-grid">
              <label class="chat-input-box__label" for="cot-style">
                模板预设
                <select
                  id="cot-style"
                  v-model="form.customChainOfThought.style"
                  class="settings-view__text-input"
                  @change="onCotStyleChange"
                >
                  <option value="prefix">头插法（规则 → 玩家输入）</option>
                  <option value="suffix">尾插法（玩家输入 → 规则）</option>
                </select>
              </label>

              <label class="chat-input-box__label" for="cot-placement">
                注入方式
                <select
                  id="cot-placement"
                  v-model="form.customChainOfThought.placement"
                  class="settings-view__text-input"
                >
                  <option value="system_message">独立系统消息</option>
                  <option value="replace_user_input">替换用户输入</option>
                </select>
              </label>
            </div>

            <label class="chat-input-box__label" for="cot-template">
              思维链模板
              <textarea
                id="cot-template"
                v-model="form.customChainOfThought.template"
                class="settings-view__textarea"
                rows="10"
              />
            </label>

            <label class="chat-input-box__label" for="cot-prefill">
              助手预填充（可选，用于引导 AI 回复开头）
              <input
                id="cot-prefill"
                v-model="form.customChainOfThought.prefillText"
                class="settings-view__text-input"
                type="text"
                placeholder="例如：以thinking标签开始：<thinking>"
              />
            </label>

            <label class="chat-input-box__label" for="cot-beautify-tag">
              美化标签名（助手回复中的 &lt;标签名&gt; 会被转换为折叠块）
              <input
                id="cot-beautify-tag"
                v-model="form.customChainOfThought.beautifyTagName"
                class="settings-view__text-input"
                type="text"
                placeholder="thinking"
              />
            </label>
          </template>

          <p v-if="statusMessage" role="status">{{ statusMessage }}</p>

          <div class="settings-view__actions">
            <button id="settings-save-cot" class="primary-cta" type="submit">
              保存 思维链 设置
            </button>
            <button
              id="settings-reset-cot"
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
            id="settings-return-game-cot"
            class="secondary-cta"
            type="button"
            @click="returnToGame"
          >
            返回主游戏
          </button>
        </div>
      </template>
    </section>
  </main>
</template>
