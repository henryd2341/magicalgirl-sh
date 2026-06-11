<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@/stores/sessionStore";
import ChatInputBox from "@/ui/chat/ChatInputBox.vue";

const sessionStore = useSessionStore();
const { snapshot } = storeToRefs(sessionStore);

const inputDisabled = computed(() => {
  if (sessionStore.isStoryTurnRunning) return true;
  const state = snapshot.value.sessionState;
  return (
    state === "COMBAT_PENDING" ||
    state === "IN_COMBAT" ||
    state === "POST_COMBAT_READY"
  );
});

async function submitMessage(content: string): Promise<void> {
  await sessionStore.runStoryTurn(content);
}
</script>

<template>
  <section id="game-input-dock" class="game-input-dock">
    <ChatInputBox
      :disabled="inputDisabled"
      @submit-message="submitMessage"
    />
  </section>
</template>
