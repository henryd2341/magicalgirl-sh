<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

async function enterTitleScreen() {
  await router.push({ name: "title" });
}
</script>

<template>
  <main id="start-screen" class="start-screen-view scrapbook-panel" role="main">
    <section class="start-screen-view__panel">
      <p class="eyebrow eyebrow--pink">Boot Sequence</p>
      <h1 class="section-heading--playful">MagicalGirl Shell</h1>
      <button
        id="start-screen-enter-button"
        class="primary-cta"
        type="button"
        @click="enterTitleScreen"
      >
        按下 Enter 或点击任意位置开始
      </button>
    </section>
  </main>
</template>
