<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

async function returnToGame() {
  await router.push({ name: "game" });
}
</script>

<template>
  <main
    id="save-export-view"
    class="save-export-view scrapbook-panel"
    role="main"
  >
    <section class="save-export-view__panel">
      <p class="eyebrow eyebrow--lime">Save Export</p>
      <h1 class="section-heading--playful">存档导出入口</h1>
      <p class="hero-subtitle">
        后续模块将在此接入导出按钮、最近存档信息与错误反馈。
      </p>
      <div class="save-export-view__actions">
        <button
          id="save-export-return-game"
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
