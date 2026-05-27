<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

async function openSettings() {
  await router.push({ name: "settings" });
}

async function openApiSettings() {
  await router.push({ name: "api-settings" });
}

async function openSaveExport() {
  await router.push({ name: "save-export" });
}

async function returnToTitle() {
  await router.push({ name: "title" });
}
</script>

<template>
  <header
    id="game-top-bar"
    class="game-top-bar scrapbook-panel"
    aria-label="主游戏顶部栏"
  >
    <div>
      <p class="eyebrow eyebrow--pink">Story Mode</p>
      <h1 class="section-heading--playful">主游戏页</h1>
    </div>
    <nav class="game-top-bar__actions" aria-label="主游戏快捷操作">
      <button
        id="game-return-title"
        class="secondary-cta"
        type="button"
        @click="returnToTitle"
      >
        返回标题页
      </button>
      <button
        id="game-open-settings"
        class="secondary-cta"
        type="button"
        @click="openSettings"
      >
        设置
      </button>
      <button
        id="game-open-api-settings"
        class="secondary-cta"
        type="button"
        @click="openApiSettings"
      >
        API 设置
      </button>
      <button
        id="game-open-save-export"
        class="secondary-cta"
        type="button"
        @click="openSaveExport"
      >
        存档导出
      </button>
    </nav>
  </header>
</template>
