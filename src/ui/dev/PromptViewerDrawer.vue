<script setup lang="ts">
import { usePromptViewerStore } from "@/stores/promptViewerStore";
import { computed, ref } from "vue";

type ViewerTab = "prompt" | "segments" | "traces" | "metadata";

const viewerStore = usePromptViewerStore();
const isOpen = ref(false);
const activeTab = ref<ViewerTab>("prompt");

const lastRequest = computed(() => viewerStore.lastRequest);
const lastProviderInfo = computed(() => viewerStore.lastProviderInfo);

const tabs: Array<{ id: ViewerTab; label: string }> = [
  { id: "prompt", label: "Prompt" },
  { id: "segments", label: "Segments" },
  { id: "traces", label: "Traces" },
  { id: "metadata", label: "Metadata" },
];

function open() {
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

defineExpose({ open });
</script>

<template>
  <div
    v-if="isOpen"
    class="mg-modal-overlay"
    @click.self="close"
    @keydown="onKeydown"
  >
    <div class="mg-modal-card mg-modal-card--wide prompt-viewer-modal">
      <button class="mg-modal__close" @click="close">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">Prompt Viewer</h2>

      <div class="mg-modal__body mg-scroll">
        <nav class="prompt-viewer-modal__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="mg-btn mg-btn--sm"
            :class="{ 'mg-btn--primary': activeTab === tab.id, 'mg-btn--ghost': activeTab !== tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <p v-if="!lastRequest" class="prompt-viewer-modal__empty">
          暂无 Request。
        </p>

        <template v-else>
          <pre v-if="activeTab === 'prompt'" class="prompt-viewer-modal__pre">{{ lastRequest.promptText }}</pre>

          <div v-else-if="activeTab === 'segments'" class="prompt-viewer-modal__list">
            <article
              v-for="segment in lastRequest.segments"
              :key="segment.id"
              class="prompt-viewer-modal__item"
            >
              <strong>{{ segment.id }}</strong>
              <span>{{ segment.title }}</span>
              <span>{{ segment.kind }}</span>
              <span>tokens: {{ segment.tokenEstimate }}</span>
              <span>{{ segment.included ? "included" : segment.droppedReason }}</span>
            </article>
          </div>

          <div v-else-if="activeTab === 'traces'" class="prompt-viewer-modal__list">
            <article
              v-for="trace in lastRequest.traces"
              :key="`${trace.sourceId}-${trace.reason}`"
              class="prompt-viewer-modal__item"
            >
              <strong>{{ trace.sourceId }}</strong>
              <span>{{ trace.kind }}</span>
              <span>{{ trace.reason }}</span>
              <span>{{ trace.included ? "included" : "dropped" }}</span>
              <span v-if="trace.priority !== undefined">priority: {{ trace.priority }}</span>
            </article>
          </div>

          <dl v-else class="prompt-viewer-modal__metadata">
            <dt>request_id</dt>
            <dd>{{ lastRequest.metadata.request_id }}</dd>
            <dt>context_version</dt>
            <dd>{{ lastRequest.metadata.context_version }}</dd>
            <dt>state_hash</dt>
            <dd>{{ lastRequest.metadata.state_hash }}</dd>
            <dt>issued_at</dt>
            <dd>{{ lastRequest.metadata.issued_at }}</dd>
            <dt>provider_kind</dt>
            <dd>{{ lastProviderInfo?.kind ?? "unknown" }}</dd>
            <dt>provider_profile</dt>
            <dd>{{ lastProviderInfo?.profileName ?? "unknown" }}</dd>
            <dt>provider_base_url</dt>
            <dd>{{ lastProviderInfo?.baseURL ?? "n/a" }}</dd>
            <dt>provider_model</dt>
            <dd>{{ lastProviderInfo?.model ?? "n/a" }}</dd>
            <dt>provider_api_key</dt>
            <dd>{{ lastProviderInfo?.hasApiKey ? "configured" : "not_configured" }}</dd>
            <dt>provider_streaming</dt>
            <dd>{{ lastProviderInfo?.streamingEnabled ? "enabled" : "disabled" }}</dd>
          </dl>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prompt-viewer-modal {
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.prompt-viewer-modal__tabs {
  display: flex;
  gap: var(--mg-space-xs, 4px);
  margin-bottom: var(--mg-space-md, 12px);
  flex-wrap: wrap;
}

.prompt-viewer-modal__pre {
  padding: var(--mg-space-md, 12px);
  background: var(--mg-bg-input, rgba(0, 0, 0, 0.15));
  border-radius: var(--mg-radius);
  font-family: var(--mg-font-mono, monospace);
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--mg-text);
  margin: 0;
}

.prompt-viewer-modal__list {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-xs, 4px);
}

.prompt-viewer-modal__item {
  padding: var(--mg-space-xs, 6px) var(--mg-space-sm, 8px);
  background: var(--mg-bg-surface, rgba(255, 255, 255, 0.03));
  border-radius: var(--mg-radius-sm);
  display: flex;
  gap: var(--mg-space-sm, 8px);
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--mg-text-secondary);
}

.prompt-viewer-modal__item strong {
  color: var(--mg-text);
}

.prompt-viewer-modal__metadata {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--mg-space-xs) var(--mg-space-md);
  font-size: 0.85rem;
  color: var(--mg-text-secondary);
  margin: 0;

  dt {
    color: var(--mg-text);
    font-weight: 600;
  }
  dd {
    margin: 0;
    word-break: break-all;
  }
}

.prompt-viewer-modal__empty {
  text-align: center;
  color: var(--mg-text-secondary);
  padding: var(--mg-space-xl, 24px);
}
</style>
