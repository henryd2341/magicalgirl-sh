<script setup lang="ts">
import SystemNotificationCenter from "@/ui/notifications/SystemNotificationCenter.vue";

const featureHighlights = [
  {
    id: "feature-single-request-fsm",
    title: "单请求状态机",
    copy: "以明确的 SessionState 与 PipelineState 驱动后续请求节奏，让剧情流、工具调用与恢复逻辑拥有统一节拍。",
  },
  {
    id: "feature-local-persistence",
    title: "本地持久化",
    copy: "后续模块将把 SQLite Worker、检查点与导出体系接进当前骨架，形成可恢复、可回滚的单机叙事基底。",
  },
  {
    id: "feature-expandable-battle-loop",
    title: "可扩展战斗回路",
    copy: "本壳层已为 COMBAT_PENDING、战斗覆盖层与战后继续剧情预留交互空间，确保视觉与系统演进一致。",
  },
];

const statChips = [
  {
    id: "chip-aesthetic-signature",
    label: "美学签名",
    value: "E-girl × E-boy × Kidcore",
  },
  { id: "chip-runtime-mode", label: "运行模式", value: "Prototype Alpha" },
  {
    id: "chip-interaction-grade",
    label: "交互等级",
    value: "Premium Micro-motion",
  },
];
</script>

<template>
  <div id="app-shell-root" class="app-shell-frame">
    <div class="ambient-layer ambient-layer--aurora" aria-hidden="true"></div>
    <div class="ambient-layer ambient-layer--grid" aria-hidden="true"></div>

    <div
      id="application-shell"
      class="app-shell"
      role="application"
      aria-label="MagicalGirl Shell"
    >
      <header id="global-header" class="hero-header glass-panel" role="banner">
        <div class="hero-header__copy">
          <p class="eyebrow">AI-Narrative Prototype // V5 MVP</p>
          <h1 id="hero-title">MagicalGirl Shell</h1>
          <p id="hero-subtitle" class="hero-subtitle">
            一套为 AI 驱动 JRPG
            叙事而生的高保真前端骨架：半糖霓虹、玻璃流体、玩具糖块色阶与轻量战术感并存。
          </p>
        </div>

        <div id="hero-control-cluster" class="hero-header__actions">
          <button id="cta-start-protocol" class="primary-cta" type="button">
            <span class="primary-cta__label">启动新月协议</span>
            <span class="primary-cta__hint">进入主游戏壳层</span>
          </button>
          <button
            id="cta-open-provider-panel"
            class="secondary-cta"
            type="button"
          >
            打开配置中枢
          </button>
        </div>
      </header>

      <main id="main-story-hub" class="main-story-hub" role="main">
        <section
          id="hero-insight-panel"
          class="story-grid__hero glass-panel"
          aria-labelledby="hero-insight-heading"
        >
          <div class="hero-spectrum" aria-hidden="true">
            <span class="hero-spectrum__orb hero-spectrum__orb--pink"></span>
            <span class="hero-spectrum__orb hero-spectrum__orb--blue"></span>
            <span class="hero-spectrum__orb hero-spectrum__orb--lime"></span>
          </div>

          <div class="section-heading">
            <p class="eyebrow">Prototype Moodboard</p>
            <h2 id="hero-insight-heading">高端、灵动、可扩展的叙事舞台</h2>
          </div>

          <p class="feature-copy">
            界面以“液态玻璃 × 俏皮糖果 ×
            赛博夜景”为母题：信息卡拥有轻微浮游感，按钮具备柔性压感反馈，背景层通过低成本渐变与网格实现生动但克制的空间感。
          </p>

          <ul
            id="stat-chip-list"
            class="stat-chip-list"
            aria-label="核心设计标签"
          >
            <li
              v-for="chip in statChips"
              :id="chip.id"
              :key="chip.id"
              class="stat-chip"
            >
              <span class="stat-chip__label">{{ chip.label }}</span>
              <strong class="stat-chip__value">{{ chip.value }}</strong>
            </li>
          </ul>
        </section>

        <section
          id="feature-runtime-overview"
          class="story-grid__features glass-panel"
          aria-labelledby="feature-runtime-heading"
        >
          <header class="section-heading">
            <p class="eyebrow">Foundation Tracks</p>
            <h2 id="feature-runtime-heading">模块 A 交付的前端基底能力</h2>
          </header>

          <div class="feature-card-grid">
            <article
              v-for="item in featureHighlights"
              :id="item.id"
              :key="item.id"
              class="feature-card"
            >
              <div class="feature-card__halo" aria-hidden="true"></div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.copy }}</p>
            </article>
          </div>
        </section>

        <SystemNotificationCenter />
      </main>
    </div>
  </div>
</template>
