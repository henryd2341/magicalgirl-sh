<script setup lang="ts">
import { usePromptPreviewStore } from "@/stores/promptPreviewStore";
import { computed, ref } from "vue";

type PreviewTab = "prompt" | "segments" | "traces" | "metadata";

const previewStore = usePromptPreviewStore();
const isOpen = ref(false);
const activeTab = ref<PreviewTab>("prompt");

const lastRequest = computed(() => previewStore.lastRequest);

const tabs: Array<{ id: PreviewTab; label: string }> = [
  { id: "prompt", label: "Prompt" },
  { id: "segments", label: "Segments" },
  { id: "traces", label: "Traces" },
  { id: "metadata", label: "Metadata" },
];

function toggleDrawer() {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <section
    id="prompt-preview-drawer"
    class="prompt-preview-drawer scrapbook-panel"
    aria-label="开发者 Prompt Preview"
  >
    <button
      id="prompt-preview-toggle"
      class="secondary-cta"
      type="button"
      @click="toggleDrawer"
    >
      开发者 Prompt Preview
    </button>

    <div v-if="isOpen" class="prompt-preview-drawer__body">
      <nav class="prompt-preview-drawer__tabs" aria-label="Prompt Preview Tabs">
        <button
          v-for="tab in tabs"
          :id="`prompt-preview-tab-${tab.id}`"
          :key="tab.id"
          class="secondary-cta"
          type="button"
          :aria-pressed="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <p v-if="!lastRequest" class="prompt-preview-drawer__empty">
        暂无 Harness Request。
      </p>

      <template v-else>
        <pre v-if="activeTab === 'prompt'" class="prompt-preview-drawer__pre">{{
          lastRequest.promptText
        }}</pre>

        <div v-else-if="activeTab === 'segments'" class="prompt-preview-drawer__list">
          <article
            v-for="segment in lastRequest.segments"
            :key="segment.id"
            class="prompt-preview-drawer__item"
          >
            <strong>{{ segment.id }}</strong>
            <span>{{ segment.title }}</span>
            <span>{{ segment.kind }}</span>
            <span>tokens: {{ segment.tokenEstimate }}</span>
            <span>{{ segment.included ? "included" : segment.droppedReason }}</span>
          </article>
        </div>

        <div v-else-if="activeTab === 'traces'" class="prompt-preview-drawer__list">
          <article
            v-for="trace in lastRequest.traces"
            :key="`${trace.sourceId}-${trace.reason}`"
            class="prompt-preview-drawer__item"
          >
            <strong>{{ trace.sourceId }}</strong>
            <span>{{ trace.kind }}</span>
            <span>{{ trace.reason }}</span>
            <span>{{ trace.included ? "included" : "dropped" }}</span>
            <span v-if="trace.priority !== undefined">priority: {{ trace.priority }}</span>
          </article>
        </div>

        <dl v-else class="prompt-preview-drawer__metadata">
          <dt>request_id</dt>
          <dd>{{ lastRequest.metadata.request_id }}</dd>
          <dt>context_version</dt>
          <dd>{{ lastRequest.metadata.context_version }}</dd>
          <dt>state_hash</dt>
          <dd>{{ lastRequest.metadata.state_hash }}</dd>
          <dt>issued_at</dt>
          <dd>{{ lastRequest.metadata.issued_at }}</dd>
        </dl>
      </template>
    </div>
  </section>
</template>
