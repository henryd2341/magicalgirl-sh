<script setup lang="ts">
import { useSessionStore } from "@/stores/sessionStore";

const sessionStore = useSessionStore();

async function continueStory(): Promise<void> {
  await sessionStore.continuePostCombatStory();
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
