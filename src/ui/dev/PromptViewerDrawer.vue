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

function toggleDrawer() {
  isOpen.value = !isOpen.value;
}
defineExpose({ toggleDrawer });
</script>

<template>
  <section
    id="prompt-viewer-drawer"
    class="prompt-viewer-drawer scrapbook-panel"
    aria-label="开发者 Prompt Viewer"
  >
    <button
      id="prompt-viewer-toggle"
      class="secondary-cta"
      type="button"
      @click="toggleDrawer"
    >
      开发者 Prompt Viewer
    </button>

    <div v-if="isOpen" class="prompt-viewer-drawer__body">
      <nav class="prompt-viewer-drawer__tabs" aria-label="Prompt Viewer Tabs">
        <button
          v-for="tab in tabs"
          :id="`prompt-viewer-tab-${tab.id}`"
          :key="tab.id"
          class="secondary-cta"
          type="button"
          :aria-pressed="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <p v-if="!lastRequest" class="prompt-viewer-drawer__empty">
        暂无 Harness Request。
      </p>

      <template v-else>
        <pre v-if="activeTab === 'prompt'" class="prompt-viewer-drawer__pre">{{
          lastRequest.promptText
        }}</pre>

        <div v-else-if="activeTab === 'segments'" class="prompt-viewer-drawer__list">
          <article
            v-for="segment in lastRequest.segments"
            :key="segment.id"
            class="prompt-viewer-drawer__item"
          >
            <strong>{{ segment.id }}</strong>
            <span>{{ segment.title }}</span>
            <span>{{ segment.kind }}</span>
            <span>tokens: {{ segment.tokenEstimate }}</span>
            <span>{{ segment.included ? "included" : segment.droppedReason }}</span>
          </article>
        </div>

        <div v-else-if="activeTab === 'traces'" class="prompt-viewer-drawer__list">
          <article
            v-for="trace in lastRequest.traces"
            :key="`${trace.sourceId}-${trace.reason}`"
            class="prompt-viewer-drawer__item"
          >
            <strong>{{ trace.sourceId }}</strong>
            <span>{{ trace.kind }}</span>
            <span>{{ trace.reason }}</span>
            <span>{{ trace.included ? "included" : "dropped" }}</span>
            <span v-if="trace.priority !== undefined">priority: {{ trace.priority }}</span>
          </article>
        </div>

        <dl v-else class="prompt-viewer-drawer__metadata">
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
  </section>
</template>
