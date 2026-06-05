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
      <h1 class="mg-start__title">MagicalGirl Shell</h1>
      <p class="mg-start__version">v5 MVP</p>
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
}

.mg-start__card {
  padding: var(--mg-space-2xl, 48px);
}

.mg-start__eyebrow {
  font-family: var(--mg-font-mono, monospace);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--mg-text-secondary, #c9a0dc);
  margin-bottom: var(--mg-space-md, 16px);
}

.mg-start__title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: clamp(3rem, 10vw, 6rem);
  font-weight: 700;
  color: var(--mg-accent, #ff6b9d);
  text-shadow: var(--mg-glow-pink);
  margin: 0 0 var(--mg-space-sm, 8px);
  line-height: 1.1;
}

.mg-start__version {
  font-size: 0.8rem;
  color: var(--mg-text-muted, #888);
  margin-bottom: var(--mg-space-xl, 32px);
}

.mg-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: var(--mg-border-width, 2px) solid;
  border-radius: var(--mg-radius-pill, 999px);
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--mg-transition-bounce, 300ms cubic-bezier(0.34, 1.56, 0.64, 1));

  &--primary {
    background: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent-strong, #ff2d78);
    color: #fff;
    &:hover { transform: scale(1.05); box-shadow: var(--mg-glow-pink); }
    &:active { transform: scale(0.97); }
  }

  &--lg { padding: 18px 40px; font-size: 1.2rem; }
}
</style>
