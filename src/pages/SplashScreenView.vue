<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useThemeDeco } from "@/composables/useThemeDeco";
import ApiSettingsView from "./ApiSettingsView.vue";
import SaveExportView from "./SaveExportView.vue";
import SettingsView from "./SettingsView.vue";
import SystemSettingsPanel from "@/ui/settings/SystemSettingsPanel.vue";

const { deco } = useThemeDeco();

const router = useRouter();

// ── Modal state ──
const showSettings = ref(false);
const showApiSettings = ref(false);
const showSaveManage = ref(false);
const showSystemSettings = ref(false);

// ── Fullscreen toggle ──
const isFullscreen = ref(!!document.fullscreenElement);
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
  isFullscreen.value = !!document.fullscreenElement;
}
document.addEventListener("fullscreenchange", () => {
  isFullscreen.value = !!document.fullscreenElement;
});

// ── Theme (managed inline in system settings modal, passed to App via event or localStorage) ──
const currentTheme = ref(window.localStorage.getItem("mg-theme") || "e-girl");
function setTheme(theme: string) {
  currentTheme.value = theme;
  window.localStorage.setItem("mg-theme", theme);
  document.documentElement.dataset.theme = theme;
}

// ── PixiJS performance settings ──
const pixiEnabled = ref(window.localStorage.getItem("mg-pixi-enabled") !== "false");
const pixiBlur = ref(window.localStorage.getItem("mg-pixi-blur") !== "false");
function togglePixi(val: boolean) {
  pixiEnabled.value = val;
  window.localStorage.setItem("mg-pixi-enabled", String(val));
  window.dispatchEvent(new window.CustomEvent("mg-pixi-toggle", { detail: val }));
}
function togglePixiBlurFn(val: boolean) {
  pixiBlur.value = val;
  window.localStorage.setItem("mg-pixi-blur", String(val));
  window.dispatchEvent(new window.CustomEvent("mg-pixi-blur-toggle", { detail: val }));
}

// ── Navigation ──
function navigateTo(routeName: string) {
  router.push({ name: routeName });
}
</script>

<template>
  <main id="splash-screen" class="mg-splash" role="main">
    <!-- ── Fullscreen Toggle (top-right corner) ── -->
    <button
      class="mg-splash__fullscreen-btn"
      :title="isFullscreen ? '退出全屏' : '全屏模式'"
      @click="toggleFullscreen"
    >
      <i :class="isFullscreen ? 'fas fa-compress' : 'fas fa-expand'"></i>
    </button>

    <!-- ── Hero Header ── -->
    <section class="mg-splash__hero">
      <p class="mg-splash__eyebrow">AI-Narrative Prototype // V5 MVP</p>
      <div class="mg-splash__logo-wrap">
        <img class="mg-splash__logo" src="/logo.png" alt="MagicalGirl SH" />
      </div>
      <div v-if="deco.splashKaomoji.length" class="mg-splash__kaomoji" aria-hidden="true">
        <span v-for="(d, i) in deco.splashKaomoji" :key="i">{{ d }}</span>
      </div>
    </section>

    <!-- ── Menu Buttons ── -->
    <nav class="mg-splash__menu" aria-label="标题菜单">
      <button class="mg-btn mg-btn--primary" @click="navigateTo('new-game')">
        <i class="fas fa-play"></i>
        开始新游戏
      </button>
      <button class="mg-btn mg-btn--ghost mg-btn--blue" @click="showSaveManage = true">
        <i class="fas fa-folder-open"></i>
        载入存档
      </button>
      <button class="mg-btn mg-btn--ghost mg-btn--green" @click="showSettings = true">
        <i class="fas fa-sliders-h"></i>
        提示词设置
      </button>
      <button class="mg-btn mg-btn--ghost mg-btn--yellow" @click="showApiSettings = true">
        <i class="fas fa-plug"></i>
        API 设置
      </button>
      <button
        class="mg-btn mg-btn--ghost mg-btn--pink"
        @click="showSystemSettings = true"
      >
        <i class="fas fa-cog"></i>
        系统设置
      </button>
    </nav>

    <!-- ── Version ── -->
    <p class="mg-splash__version">v5 MVP — feat-frontend-refactor</p>

    <!-- ══════════════════════════════════════════════════════
         MODALS
         ══════════════════════════════════════════════════════ -->

    <!-- Settings Modal -->
    <div
      v-if="showSettings"
      class="mg-modal-overlay"
      @click.self="showSettings = false"
    >
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showSettings = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">提示词设置</h2>
        <div class="mg-modal__body mg-scroll">
          <SettingsView :embedded="true" @close="showSettings = false" />
        </div>
      </div>
    </div>

    <!-- API Settings Modal -->
    <div
      v-if="showApiSettings"
      class="mg-modal-overlay"
      @click.self="showApiSettings = false"
    >
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showApiSettings = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">API 设置</h2>
        <div class="mg-modal__body mg-scroll">
          <ApiSettingsView :embedded="true" @close="showApiSettings = false" />
        </div>
      </div>
    </div>

    <!-- Save Management Modal -->
    <div
      v-if="showSaveManage"
      class="mg-modal-overlay"
      @click.self="showSaveManage = false"
    >
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showSaveManage = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">载入存档</h2>
        <div class="mg-modal__body mg-scroll">
          <SaveExportView :embedded="true" @close="showSaveManage = false" />
        </div>
      </div>
    </div>

    <!-- System Settings Modal -->
    <div
      v-if="showSystemSettings"
      class="mg-modal-overlay"
      @click.self="showSystemSettings = false"
    >
      <div class="mg-modal-card">
        <button class="mg-modal__close" @click="showSystemSettings = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">系统设置</h2>
        <div class="mg-modal__body">
          <div class="mg-system-settings">
            <div class="mg-sys-section">
              <h3>主题切换</h3>
              <div class="mg-theme-options">
                <button
                  v-for="theme in [
                    { id: 'e-girl', label: 'E-girl / E-boy', icon: 'fa-heart' },
                    { id: 'kidcore', label: 'Kidcore', icon: 'fa-star' },
                    {
                      id: 'pastel-brutalism',
                      label: 'Pastel Brutalism',
                      icon: 'fa-square',
                    },
                  ]"
                  :key="theme.id"
                  class="mg-theme-btn"
                  :class="{ 'mg-theme-btn--active': currentTheme === theme.id }"
                  @click="setTheme(theme.id)"
                >
                  <i :class="`fas ${theme.icon}`"></i>
                  {{ theme.label }}
                </button>
              </div>
            </div>
            <SystemSettingsPanel />
            <div class="mg-sys-section">
              <h3><i class="fas fa-bolt"></i> 性能设置</h3>
              <p class="mg-sys-section__hint">PixiJS WebGL 背景特效对首次加载影响较大，可在低性能设备上关闭。</p>
              <label class="mg-toggle">
                <input type="checkbox" :checked="pixiEnabled" @change="togglePixi(($event.target as HTMLInputElement).checked)" />
                <span class="mg-toggle__slider"></span>
                <span class="mg-toggle__label">PixiJS 背景特效</span>
              </label>
              <label class="mg-toggle" :class="{ 'mg-toggle--disabled': !pixiEnabled }">
                <input type="checkbox" :checked="pixiBlur" :disabled="!pixiEnabled" @change="togglePixiBlurFn(($event.target as HTMLInputElement).checked)" />
                <span class="mg-toggle__slider"></span>
                <span class="mg-toggle__label">背景模糊动效</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
// ============================================================
// SplashScreen — LAYOUT ONLY (shared classes in _e-girl.scss)
// ============================================================

.mg-splash {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--mg-space-2xl) var(--mg-space-lg);
  text-align: center;
  z-index: 1;
}

.mg-splash__fullscreen-btn {
  position: fixed;
  top: 16px; right: 16px;
  z-index: var(--mg-z-overlay);
  width: 40px; height: 40px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius-sm);
  background: var(--mg-bg-card);
  color: var(--mg-text-secondary);
  font-size: var(--mg-font-base);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--mg-transition-fast);
  &:hover { color: var(--mg-accent); border-color: var(--mg-accent); box-shadow: var(--mg-glow-pink); }
}

.mg-splash__hero      { margin-bottom: var(--mg-space-xl); }
.mg-splash__logo-wrap { display: flex; justify-content: center; align-items: center; margin-bottom: var(--mg-space-md); }
.mg-splash__logo      { max-width: 300px; width: 60vw; height: auto; filter: drop-shadow(0 0 12px var(--mg-accent-glow)); }
.mg-splash__eyebrow   { font-family: var(--mg-font-mono); font-size: var(--mg-font-sm); text-transform: uppercase; letter-spacing: var(--mg-tracking-eyebrow); color: var(--mg-text-secondary); margin-bottom: var(--mg-space-md); }
.mg-splash__title     { font-family: var(--mg-font-heading); font-size: var(--mg-font-display); font-weight: var(--mg-font-weight-heading); color: var(--mg-accent); text-shadow: var(--mg-text-outline); margin: 0 0 var(--mg-space-md); line-height: var(--mg-leading-tight); }
.mg-splash__subtitle  { max-width: 560px; margin: 0 auto; font-size: var(--mg-font-base); line-height: var(--mg-leading-relaxed); color: var(--mg-text-secondary); }
.mg-splash__kaomoji   { display: flex; gap: var(--mg-space-md); align-items: center; justify-content: center; margin-top: var(--mg-space-md); font-size: var(--mg-font-sm); color: var(--mg-text-muted); opacity: 0.6; flex-wrap: wrap; user-select: none; }
.mg-splash__version   { margin-top: var(--mg-space-xl); font-size: 0.75rem; color: var(--mg-text-muted); }

.mg-splash__menu {
  display: flex; flex-direction: column;
  gap: var(--mg-space-sm);
  width: 100%; max-width: 320px;
  // Slightly bump primary button in menu
  .mg-btn--primary { padding: 16px 32px; font-size: 1.05rem; }
}
</style>
