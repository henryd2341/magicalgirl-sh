<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

async function returnToGame() {
  await router.push({ name: "game" });
}
</script>

<template>
  <main id="settings-view" class="settings-view scrapbook-panel" role="main">
    <section class="settings-view__panel">
      <p class="eyebrow eyebrow--blue">Provider Config</p>
      <h1 class="section-heading--playful">设置 / Provider 配置</h1>
      <p class="hero-subtitle">
        后续模块将在此接入 Provider、模型与温度参数配置。
      </p>
      <div class="settings-view__actions">
        <button
          id="settings-return-game"
          class="secondary-cta"
          type="button"
          @click="returnToGame"
        >
          返回主游戏
        </button>
      </div>
    </section>
  </main>
</template>
