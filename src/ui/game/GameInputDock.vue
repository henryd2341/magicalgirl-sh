<script setup lang="ts">
import { useChatStore } from "@/stores/chatStore";
import ChatInputBox from "@/ui/chat/ChatInputBox.vue";

const chatStore = useChatStore();

function createMessageId(): string {
  const webCrypto = globalThis.crypto;

  if (webCrypto && "randomUUID" in webCrypto) {
    return webCrypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function submitMessage(content: string): Promise<void> {
  await chatStore.createUserMessage({
    id: createMessageId(),
    content,
    createdAt: new Date().toISOString(),
  });
}
</script>

<template>
  <section id="game-input-dock" class="game-input-dock">
    <ChatInputBox @submit-message="submitMessage" />
  </section>
</template>
