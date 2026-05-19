<script setup lang="ts">
import SystemNotificationCenter from "@/ui/notifications/SystemNotificationCenter.vue";

const primaryNavItems = [
  { id: "nav-link-prologue", label: "序章入口", tone: "pink" },
  { id: "nav-link-wardrobe", label: "风格档案", tone: "violet" },
  { id: "nav-link-signal", label: "讯号板", tone: "blue" },
];

const featureHighlights = [
  {
    id: "feature-single-request-fsm",
    sticker: "SYNC LOOP",
    title: "单请求状态机",
    copy: "以明确的 SessionState 与 PipelineState 驱动后续请求节奏，让剧情流、工具调用与恢复逻辑拥有统一节拍。",
  },
  {
    id: "feature-local-persistence",
    sticker: "SAVE POP",
    title: "本地持久化",
    copy: "后续模块将把 SQLite Worker、检查点与导出体系接进当前骨架，形成可恢复、可回滚的单机叙事基底。",
  },
  {
    id: "feature-expandable-battle-loop",
    sticker: "BATTLE RIBBON",
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
  { id: "chip-runtime-mode", label: "运行模式", value: "Scrapbook Runtime" },
  {
    id: "chip-interaction-grade",
    label: "交互等级",
    value: "Cute // Edge // Play",
  },
];

const stickerNotes = [
  {
    id: "sticker-note-persona",
    title: "视觉贴纸板",
    body: "粉黑张力、糖果描边、格纹切片、涂鸦标签与轻微数字噪点共同构成当前首页的视觉语法。",
  },
  {
    id: "sticker-note-motion",
    title: "动态设计",
    body: "按钮、贴纸卡、提示板与背景漂浮层都拥有轻量但明确的响应式微交互，强化“会呼吸”的界面气质。",
  },
];
</script>

<template>
  <div id="app-shell-root" class="app-shell-frame">
    <div class="ambient-layer ambient-layer--confetti" aria-hidden="true"></div>
    <div class="ambient-layer ambient-layer--checker" aria-hidden="true"></div>
    <div class="ambient-layer ambient-layer--glow" aria-hidden="true"></div>

    <div
      id="application-shell"
      class="app-shell"
      role="application"
      aria-label="MagicalGirl Shell"
    >
      <header
        id="global-header"
        class="hero-header scrapbook-panel"
        role="banner"
      >
        <nav id="nav-story-index" class="story-nav" aria-label="主导航">
          <a
            v-for="item in primaryNavItems"
            :id="item.id"
            :key="item.id"
            class="story-nav__link"
            :data-tone="item.tone"
            href="#"
          >
            {{ item.label }}
          </a>
        </nav>

        <div class="hero-layout">
          <section class="hero-marquee" aria-labelledby="hero-title">
            <p class="eyebrow eyebrow--pink">
              AI-Narrative Prototype // V5 MVP
            </p>
            <div class="hero-kicker-band" aria-hidden="true">
              <span>cute.exe</span>
              <span>edge.dll</span>
              <span>magic-core</span>
            </div>
            <h1 id="hero-title">MagicalGirl Shell</h1>
            <p id="hero-subtitle" class="hero-subtitle">
              一套为 AI 驱动 JRPG 叙事而生的高保真前端骨架：将 E-girl / E-boy
              的粉黑对撞、Kidcore 的玩具箱密度与 RPG UI
              的仪式感揉进同一块发光贴纸板。
            </p>

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
          </section>

          <aside
            id="hero-sticker-board"
            class="hero-sticker-board"
            aria-label="视觉贴纸板"
          >
            <div class="floating-sticker floating-sticker--heart">♥ SIGNAL</div>
            <div class="floating-sticker floating-sticker--star">★ ARCHIVE</div>
            <div class="floating-sticker floating-sticker--grid">
              CHECKER MODE
            </div>
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
          </aside>
        </div>
      </header>

      <main id="main-story-hub" class="main-story-hub" role="main">
        <section
          id="hero-insight-panel"
          class="story-grid__hero scrapbook-panel"
          aria-labelledby="hero-insight-heading"
        >
          <div class="section-heading section-heading--playful">
            <p class="eyebrow eyebrow--lime">Prototype Moodboard</p>
            <h2 id="hero-insight-heading">高端、灵动、可扩展的叙事舞台</h2>
          </div>

          <div class="insight-layout">
            <p class="feature-copy">
              当前方向不再是纯“科幻玻璃壳”，而是更接近网感次文化与玩具拼贴的高端混血：厚描边卡片、贴纸式标签、格纹切片、星形点缀、粉黑主轴、糖果高光与轻微噪点纹理共同制造“可截图、可记忆、可游玩”的视觉身份。
            </p>

            <div class="sticker-note-grid">
              <article
                v-for="note in stickerNotes"
                :id="note.id"
                :key="note.id"
                class="sticker-note"
              >
                <h3>{{ note.title }}</h3>
                <p>{{ note.body }}</p>
              </article>
            </div>
          </div>
        </section>

        <section
          id="feature-runtime-overview"
          class="story-grid__features scrapbook-panel"
          aria-labelledby="feature-runtime-heading"
        >
          <header class="section-heading section-heading--playful">
            <p class="eyebrow eyebrow--blue">Foundation Tracks</p>
            <h2 id="feature-runtime-heading">模块 A 交付的前端基底能力</h2>
          </header>

          <div class="feature-card-grid">
            <article
              v-for="item in featureHighlights"
              :id="item.id"
              :key="item.id"
              class="feature-card"
            >
              <span class="feature-card__sticker">{{ item.sticker }}</span>
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
