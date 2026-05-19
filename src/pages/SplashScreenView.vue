<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

const menuItems = [
  { id: "splash-start-new-game", label: "开始新游戏", routeName: "new-game" },
  { id: "splash-continue-game", label: "继续游戏", routeName: "game" },
  { id: "splash-open-settings", label: "设置", routeName: "settings" },
  {
    id: "splash-open-save-export",
    label: "存档导出",
    routeName: "save-export",
  },
  { id: "splash-exit-to-start", label: "返回开始页", routeName: "start" },
] as const;

async function navigateTo(routeName: (typeof menuItems)[number]["routeName"]) {
  await router.push({ name: routeName });
}
</script>

<template>
  <main
    id="splash-screen"
    class="splash-screen-view scrapbook-panel"
    role="main"
  >
    <section class="hero-header">
      <p class="eyebrow eyebrow--pink">AI-Narrative Prototype // V5 MVP</p>
      <div class="hero-kicker-band" aria-hidden="true">
        <span>cute.exe</span>
        <span>edge.dll</span>
        <span>magic-core</span>
      </div>
      <h1 id="splash-title">MagicalGirl Shell</h1>
      <p class="hero-subtitle">
        一套为 AI 驱动 JRPG 叙事而生的高保真前端骨架：将 E-girl / E-boy
        的粉黑对撞、Kidcore 的玩具箱密度与 RPG UI 的仪式感揉进同一块发光贴纸板。
      </p>
    </section>

    <section class="splash-screen-view__menu" aria-label="标题菜单">
      <button
        v-for="item in menuItems"
        :id="item.id"
        :key="item.id"
        class="primary-cta splash-screen-view__menu-button"
        type="button"
        @click="navigateTo(item.routeName)"
      >
        {{ item.label }}
      </button>
    </section>
  </main>
</template>
