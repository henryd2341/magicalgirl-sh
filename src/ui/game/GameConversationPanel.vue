<script setup lang="ts">
import { useChatStore } from "@/stores/chatStore";
import ChatMessageList from "@/ui/chat/ChatMessageList.vue";
import FailedDraftActions from "@/ui/chat/FailedDraftActions.vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const chatStore = useChatStore();
const { messages } = storeToRefs(chatStore);

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.user_visible);
});

const latestFailedDraftId = computed(() => {
  const failedDrafts = messages.value.filter((message) => message.failed);
  return failedDrafts.at(-1)?.id ?? null;
});
</script>

<template>
  <section id="game-conversation-panel" class="game-conversation-panel">
    <ChatMessageList :messages="visibleMessages" />
    <FailedDraftActions
      v-if="latestFailedDraftId"
      :message-id="latestFailedDraftId"
    />
  </section>
</template>
