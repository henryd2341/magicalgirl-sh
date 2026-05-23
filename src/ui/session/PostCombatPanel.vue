<script setup lang="ts">
import { useSessionStore } from "@/stores/sessionStore";

const sessionStore = useSessionStore();

function createPostCombatRequestId(): string {
  return `post-combat-continue-${Date.now().toString(36)}`;
}

function continueStory() {
  sessionStore.beginAiRequest(createPostCombatRequestId());
}
</script>

<template>
  <section
    id="post-combat-panel"
    class="post-combat-panel scrapbook-panel"
    aria-label="战后续写"
  >
    <button type="button" class="primary-cta" @click="continueStory">
      继续剧情
    </button>
  </section>
</template>
