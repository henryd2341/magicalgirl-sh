<script setup lang="ts">
import { useSessionStore } from "@/stores/sessionStore";
import ChatInputBox from "@/ui/chat/ChatInputBox.vue";

const sessionStore = useSessionStore();

async function submitMessage(content: string): Promise<void> {
  await sessionStore.runStoryTurn(content);
}
</script>

<template>
  <section id="game-input-dock" class="game-input-dock">
    <ChatInputBox
      :disabled="sessionStore.isStoryTurnRunning"
      @submit-message="submitMessage"
    />
  </section>
</template>
