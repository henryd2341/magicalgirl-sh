<script setup lang="ts">
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import ChatMessageList from "@/ui/chat/ChatMessageList.vue";
import FailedDraftActions from "@/ui/chat/FailedDraftActions.vue";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const { messages } = storeToRefs(chatStore);
const recoveryStatus = ref<string | null>(null);
const recoveryError = ref<string | null>(null);
const isRollingBack = ref(false);

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
</script>

<template>
  <section id="game-conversation-panel" class="game-conversation-panel">
    <ChatMessageList :messages="visibleMessages" />
    <FailedDraftActions
      v-if="latestFailedDraftId"
      :message-id="latestFailedDraftId"
      retry-disabled
      edit-retry-disabled
      :rollback-disabled="isRollingBack"
      @rollback="rollbackLatestFailedDraft"
    />
    <p v-if="recoveryStatus" class="hero-subtitle" role="status">
      {{ recoveryStatus }}
    </p>
    <p v-if="recoveryError" class="hero-subtitle" role="alert">
      {{ recoveryError }}
    </p>
  </section>
</template>
