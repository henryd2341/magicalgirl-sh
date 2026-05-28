<script setup lang="ts">
import {
  listProviderModels,
  testProviderConnection,
} from "@/orchestrator/providerDiagnostics";
import {
  BUILTIN_FAKE_PROFILE_ID,
  createDefaultProviderSettingsState,
  getProviderSettingsRepository,
  type ProviderProfile,
  type ProviderProfileKind,
  type ProviderSettingsState,
} from "@/orchestrator/providerSettings";
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const repository = getProviderSettingsRepository();
const state = ref<ProviderSettingsState>(createDefaultProviderSettingsState());
const statusMessage = ref("");
const availableModels = ref<string[]>([]);
const form = reactive({
  id: BUILTIN_FAKE_PROFILE_ID,
  name: "Fake Provider",
  kind: "fake" as ProviderProfileKind,
  baseURL: "",
  model: "",
  apiKey: "",
  temperature: 0.7,
  maxOutputTokens: 1024,
  streamingEnabled: true,
  reasoningEffort: "medium" as "low" | "medium" | "high" | undefined,
  builtIn: true,
});

const activeProfile = computed(() =>
  state.value.profiles.find(
    (profile) => profile.id === state.value.activeProfileId,
  ),
);
const isBuiltInProfile = computed(() => form.builtIn);

function applyProfile(profile: ProviderProfile): void {
  form.id = profile.id;
  form.name = profile.name;
  form.kind = profile.kind;
  form.baseURL = profile.baseURL;
  form.model = profile.model;
  form.apiKey = profile.apiKey;
  form.temperature = profile.temperature;
  form.maxOutputTokens = profile.maxOutputTokens;
  form.streamingEnabled = profile.streamingEnabled;
  form.reasoningEffort = profile.reasoningEffort;
  form.builtIn = profile.builtIn;
}

async function refreshState(): Promise<void> {
  state.value = await repository.getState();
  const nextActiveProfile =
    state.value.profiles.find(
      (profile) => profile.id === state.value.activeProfileId,
    ) ?? state.value.profiles[0];

  if (nextActiveProfile) {
    applyProfile(nextActiveProfile);
  }
}

async function returnToGame(): Promise<void> {
  await router.push({ name: "game" });
}

async function selectProfile(profileId: string): Promise<void> {
  await repository.setActiveProfile(profileId);
  availableModels.value = [];
  await refreshState();
}

async function addProfile(): Promise<void> {
  const profile = await repository.addProfile({
    name: "New Provider",
    kind: "openai-compatible",
    baseURL: "",
    model: "",
    apiKey: "",
    temperature: 0.7,
    maxOutputTokens: 1024,
    streamingEnabled: true,
    reasoningEffort: "medium",
  });
  await repository.setActiveProfile(profile.id);
  statusMessage.value = "Profile 已创建。";
  await refreshState();
}

async function saveCurrentProfile(): Promise<void> {
  if (form.builtIn) {
    statusMessage.value = "内置 Fake Provider 无需保存。";
    return;
  }

  await repository.updateProfile(form.id, {
    name: form.name,
    kind: form.kind,
    baseURL: form.baseURL,
    model: form.model,
    apiKey: form.apiKey,
    temperature: Number(form.temperature),
    maxOutputTokens: Number(form.maxOutputTokens),
    streamingEnabled: form.streamingEnabled,
    reasoningEffort: form.reasoningEffort,
  });
  statusMessage.value = "API Provider 设置已保存。";
  await refreshState();
}

async function deleteCurrentProfile(): Promise<void> {
  if (form.builtIn) {
    return;
  }

  await repository.deleteProfile(form.id);
  availableModels.value = [];
  statusMessage.value = "Profile 已删除。";
  await refreshState();
}

async function clearCurrentApiKey(): Promise<void> {
  await repository.clearApiKey(form.id);
  statusMessage.value = "API Key 已清空。";
  await refreshState();
}

function buildCurrentProfile(): ProviderProfile {
  return {
    id: form.id,
    name: form.name,
    kind: form.kind,
    baseURL: form.baseURL,
    model: form.model,
    apiKey: form.apiKey,
    temperature: Number(form.temperature),
    maxOutputTokens: Number(form.maxOutputTokens),
    streamingEnabled: form.streamingEnabled,
    reasoningEffort: form.reasoningEffort,
    builtIn: form.builtIn,
    updatedAt: activeProfile.value?.updatedAt ?? new Date().toISOString(),
  };
}

async function runConnectionTest(): Promise<void> {
  const result = await testProviderConnection(buildCurrentProfile());
  statusMessage.value = result.ok
    ? `连接成功：${result.models.length} 个模型。`
    : `连接失败：${result.status}`;
  availableModels.value = result.models ?? [];
}

async function fetchModels(): Promise<void> {
  const result = await listProviderModels(buildCurrentProfile());
  statusMessage.value = result.ok
    ? `已获取 ${result.models.length} 个模型。`
    : `获取模型失败：${result.status}`;
  availableModels.value = result.ok ? result.models : [];
}

function chooseModel(modelId: string): void {
  form.model = modelId;
}

onMounted(refreshState);
</script>

<template>
  <main id="api-settings-view" class="settings-view scrapbook-panel" role="main">
    <section class="settings-view__panel">
      <p class="eyebrow eyebrow--blue">Provider Profiles</p>
      <h1 class="section-heading--playful">API Provider 设置</h1>

      <section class="settings-view__world-info" aria-label="Provider Profiles">
        <div class="settings-view__world-info-actions">
          <button
            v-for="profile in state.profiles"
            :id="`api-profile-select-${profile.id}`"
            :key="profile.id"
            class="secondary-cta"
            type="button"
            :aria-pressed="profile.id === state.activeProfileId"
            @click="selectProfile(profile.id)"
          >
            {{ profile.name }}
          </button>
        </div>
        <button
          id="api-settings-add-profile"
          class="primary-cta"
          type="button"
          @click="addProfile"
        >
          新增 Profile
        </button>
      </section>

      <form class="settings-view__form" @submit.prevent="saveCurrentProfile">
        <div class="settings-view__budget-grid">
          <label class="chat-input-box__label" for="api-profile-name">
            Profile 名称
            <input
              id="api-profile-name"
              v-model="form.name"
              class="settings-view__text-input"
              type="text"
              :disabled="isBuiltInProfile"
            />
          </label>
          <label class="chat-input-box__label" for="api-profile-kind">
            Provider 类型
            <select
              id="api-profile-kind"
              v-model="form.kind"
              class="settings-view__text-input"
              :disabled="isBuiltInProfile"
            >
              <option value="fake">Fake</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
        </div>

        <label class="chat-input-box__label" for="api-profile-base-url">
          Base URL
          <input
            id="api-profile-base-url"
            v-model="form.baseURL"
            class="settings-view__text-input"
            type="url"
            placeholder="https://api.example.com/v1"
            :disabled="isBuiltInProfile"
          />
        </label>

        <label class="chat-input-box__label" for="api-profile-model">
          Model
          <input
            id="api-profile-model"
            v-model="form.model"
            class="settings-view__text-input"
            type="text"
            placeholder="model-id"
            :disabled="isBuiltInProfile"
          />
        </label>

        <label class="chat-input-box__label" for="api-profile-api-key">
          API Key
          <input
            id="api-profile-api-key"
            v-model="form.apiKey"
            class="settings-view__text-input"
            type="password"
            autocomplete="off"
            :disabled="isBuiltInProfile"
          />
        </label>

        <div class="settings-view__budget-grid">
          <label class="chat-input-box__label" for="api-profile-temperature">
            Temperature
            <input
              id="api-profile-temperature"
              v-model.number="form.temperature"
              class="settings-view__number-input"
              type="number"
              min="0"
              max="2"
              step="0.1"
              :disabled="isBuiltInProfile"
            />
          </label>
          <label class="chat-input-box__label" for="api-profile-max-output-tokens">
            Max output tokens
            <input
              id="api-profile-max-output-tokens"
              v-model.number="form.maxOutputTokens"
              class="settings-view__number-input"
              type="number"
              min="1"
              :disabled="isBuiltInProfile"
            />
          </label>
          <label
            class="chat-input-box__label settings-view__checkbox-label"
            for="api-profile-streaming-enabled"
          >
            <input
              id="api-profile-streaming-enabled"
              v-model="form.streamingEnabled"
              type="checkbox"
              :disabled="isBuiltInProfile"
            />
            流式生成
          </label>
          <label
            v-if="form.kind === 'openai-compatible'"
            class="chat-input-box__label"
            for="api-profile-reasoning-effort"
          >
            Reasoning Effort
            <select
              id="api-profile-reasoning-effort"
              v-model="form.reasoningEffort"
              class="settings-view__text-input"
              :disabled="isBuiltInProfile"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>

        <section
          v-if="availableModels.length > 0"
          class="settings-view__mustache"
          aria-label="可用模型"
        >
          <h2 class="settings-view__subheading">可用模型</h2>
          <div class="settings-view__world-info-actions">
            <button
              v-for="modelId in availableModels"
              :key="modelId"
              class="secondary-cta"
              type="button"
              @click="chooseModel(modelId)"
            >
              {{ modelId }}
            </button>
          </div>
        </section>

        <p v-if="statusMessage" role="status">{{ statusMessage }}</p>

        <div class="settings-view__actions">
          <button id="api-settings-save-profile" class="primary-cta" type="submit">
            保存 API 设置
          </button>
          <button
            id="api-settings-test-connection"
            class="secondary-cta"
            type="button"
            @click="runConnectionTest"
          >
            连接测试
          </button>
          <button
            id="api-settings-fetch-models"
            class="secondary-cta"
            type="button"
            @click="fetchModels"
          >
            获取模型列表
          </button>
          <button
            id="api-settings-clear-api-key"
            class="secondary-cta"
            type="button"
            :disabled="isBuiltInProfile"
            @click="clearCurrentApiKey"
          >
            清空 API Key
          </button>
          <button
            id="api-settings-delete-profile"
            class="secondary-cta secondary-cta--warning"
            type="button"
            :disabled="isBuiltInProfile"
            @click="deleteCurrentProfile"
          >
            删除 Profile
          </button>
        </div>
      </form>

      <div class="settings-view__actions">
        <button
          id="api-settings-return-game"
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
