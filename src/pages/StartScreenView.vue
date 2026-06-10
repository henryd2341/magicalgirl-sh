<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

async function enterTitleScreen() {
  // Try fullscreen API before entering
  document.documentElement.requestFullscreen?.().catch(() => {});
  await router.push({ name: "title" });
}
</script>

<template>
  <main id="start-screen" class="mg-start" role="main">
    <div class="mg-start__card">
      <p class="mg-start__eyebrow">Boot Sequence</p>
      <img
        src="/logo.png"
        alt="MagicalGirl SH"
        class="mg-start__title mg-glitch-hover"
      />
      <p class="mg-start__version">v0.8 Beta</p>
      <button
        id="start-screen-enter-button"
        class="mg-btn mg-btn--primary mg-btn--lg"
        type="button"
        @click="enterTitleScreen"
      >
        <i class="fas fa-play"></i>
        点击开始
      </button>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.mg-start {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
  z-index: 1;
  position: relative;
}
.mg-start__card {
  padding: var(--mg-space-2xl);
}
.mg-start__eyebrow {
  font-family: var(--mg-font-mono);
  font-size: var(--mg-font-sm);
  text-transform: uppercase;
  letter-spacing: var(--mg-tracking-eyebrow);
  color: var(--mg-text-secondary);
  margin-bottom: var(--mg-space-md);
}
.mg-start__title {
  max-width: 350px;
  width: 60vw;
  height: auto;
  filter: drop-shadow(0 0 12px rgba(255, 107, 157, 0.35));
}
.mg-start__version {
  font-size: var(--mg-font-sm);
  color: var(--mg-text-muted);
  margin-bottom: var(--mg-space-xl);
}
</style>
