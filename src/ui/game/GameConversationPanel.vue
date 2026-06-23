<script setup lang="ts">
import { getPromptPresetRepository } from "@/orchestrator/promptPreset";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import ChatMessageList from "@/ui/chat/ChatMessageList.vue";
import FailedDraftActions from "@/ui/chat/FailedDraftActions.vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const { messages } = storeToRefs(chatStore);
const { summarizationStatus } = storeToRefs(sessionStore);
const recoveryStatus = ref<string | null>(null);
const recoveryError = ref<string | null>(null);
const isRollingBack = ref(false);
const cotBeautifyTagName = ref<string | undefined>();

const showSummaryBadge = ref(false);
const summaryBadgeText = ref("");
const summaryBadgeClass = ref("");

let badgeTimer: ReturnType<typeof setTimeout> | null = null;

watch(summarizationStatus, (status) => {
  if (status === "running") {
    showSummaryBadge.value = true;
    summaryBadgeText.value = "正在压缩记忆…";
    summaryBadgeClass.value = "summary-badge--running";
    if (badgeTimer) {
      clearTimeout(badgeTimer);
      badgeTimer = null;
    }
  } else if (status === "done") {
    summaryBadgeText.value = "记忆压缩完成";
    summaryBadgeClass.value = "summary-badge--done";
    if (badgeTimer) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      showSummaryBadge.value = false;
    }, 3000);
  } else if (status === "error") {
    summaryBadgeText.value = "记忆压缩失败，已跳过";
    summaryBadgeClass.value = "summary-badge--error";
    if (badgeTimer) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      showSummaryBadge.value = false;
    }, 3000);
  } else {
    showSummaryBadge.value = false;
    if (badgeTimer) {
      clearTimeout(badgeTimer);
      badgeTimer = null;
    }
  }
});

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.user_visible);
});

const latestFailedDraftId = computed(() => {
  const failedDrafts = messages.value.filter((message) => message.failed);
  return failedDrafts.at(-1)?.id ?? null;
});

async function rollbackLatestFailedDraft() {
  if (isRollingBack.value) {
    return;
  }

  isRollingBack.value = true;
  recoveryStatus.value = null;
  recoveryError.value = null;

  try {
    const result = await sessionStore.rollbackToLatestIdleCheckpoint();
    await chatStore.refreshMessages();
    recoveryStatus.value = `已回滚到 ${result.checkpointId}。`;
  } catch (error) {
    recoveryError.value =
      error instanceof Error ? error.message : "回滚到最近检查点失败。";
  } finally {
    isRollingBack.value = false;
  }
}

onMounted(async () => {
  const preset = await getPromptPresetRepository().getCurrent();
  const cot = preset.customChainOfThought;
  if (cot?.enabled && cot.beautifyTagName) {
    cotBeautifyTagName.value = cot.beautifyTagName;
  }
});
</script>

<template>
  <section id="game-conversation-panel" class="game-conversation-panel">
    <ChatMessageList
      :messages="visibleMessages"
      :beautify-tag-name="cotBeautifyTagName"
      @retry="sessionStore.retryFromMessage($event)"
    />
    <FailedDraftActions
      v-if="latestFailedDraftId"
      :message-id="latestFailedDraftId"
      retry-disabled
      edit-retry-disabled
      :rollback-disabled="isRollingBack"
      @rollback="rollbackLatestFailedDraft"
    />
    <Transition name="summary-badge-fade">
      <div
        v-if="showSummaryBadge"
        class="summary-badge"
        :class="summaryBadgeClass"
        role="status"
        aria-live="polite"
      >
        <i
          class="fas fa-spinner fa-spin"
          v-if="summarizationStatus === 'running'"
          aria-hidden="true"
        ></i>
        <i
          class="fas fa-check-circle"
          v-else-if="summarizationStatus === 'done'"
          aria-hidden="true"
        ></i>
        <i
          class="fas fa-exclamation-circle"
          v-else-if="summarizationStatus === 'error'"
          aria-hidden="true"
        ></i>
        <span>{{ summaryBadgeText }}</span>
      </div>
    </Transition>
    <p v-if="recoveryStatus" class="hero-subtitle" role="status">
      {{ recoveryStatus }}
    </p>
    <p v-if="recoveryError" class="hero-subtitle" role="alert">
      {{ recoveryError }}
    </p>
  </section>
</template>

<style lang="scss" scoped>
.summary-badge {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 0.5rem);
  padding: var(--mg-space-sm, 0.5rem) var(--mg-space-md, 1rem);
  margin: var(--mg-space-sm, 0.5rem) 0;
  border-radius: var(--mg-radius, 8px);
  font-size: var(--mg-font-sm, 0.875rem);
  animation: summary-badge-slide-in 0.3s ease-out;
}

.summary-badge--running {
  background: rgba(100, 149, 237, 0.15);
  color: #6495ed;
}

.summary-badge--done {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.summary-badge--error {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
}

.summary-badge-fade-enter-active,
.summary-badge-fade-leave-active {
  transition: opacity 0.3s ease;
}

.summary-badge-fade-enter-from,
.summary-badge-fade-leave-to {
  opacity: 0;
}

@keyframes summary-badge-slide-in {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
