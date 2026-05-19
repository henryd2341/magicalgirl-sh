<script setup lang="ts">
import type { ChatMessage } from "@/types/chat";
import ChatMessageList from "@/ui/chat/ChatMessageList.vue";
import FailedDraftActions from "@/ui/chat/FailedDraftActions.vue";

const demoMessages: ChatMessage[] = [
  {
    id: "system-welcome",
    role: "system",
    kind: "normal",
    content: "欢迎进入主游戏舞台。后续 AI 叙事消息将在这里持续展开。",
    user_visible: true,
    ai_visible: true,
    provisional: false,
    finalized: true,
    failed: false,
    created_at: "2026-05-20T00:00:00.000Z",
  },
];
</script>

<template>
  <section id="game-conversation-panel" class="game-conversation-panel">
    <ChatMessageList :messages="demoMessages" />
    <FailedDraftActions message-id="failed-draft-preview" />
  </section>
</template>
