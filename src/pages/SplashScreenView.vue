<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import ApiSettingsView from "./ApiSettingsView.vue";
import SaveExportView from "./SaveExportView.vue";
import SettingsView from "./SettingsView.vue";

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
  window.dispatchEvent(new CustomEvent("mg-pixi-toggle", { detail: val }));
}
function togglePixiBlurFn(val: boolean) {
  pixiBlur.value = val;
  window.localStorage.setItem("mg-pixi-blur", String(val));
  window.dispatchEvent(new CustomEvent("mg-pixi-blur-toggle", { detail: val }));
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
      <!-- No subtitles -->
      <!-- <p class="mg-splash__subtitle">
        一套为 AI 驱动 JRPG 叙事而生的高保真前端骨架，将 E-girl / E-boy
        的粉黑对撞、Kidcore 的玩具箱密度与 RPG UI 的仪式感揉进同一块发光贴纸板。
      </p> -->
    </section>

    <!-- ── Menu Buttons ── -->
    <nav class="mg-splash__menu" aria-label="标题菜单">
      <button class="mg-btn mg-btn--primary" @click="navigateTo('new-game')">
        <i class="fas fa-play"></i>
        开始新游戏
      </button>
      <button class="mg-btn mg-btn--secondary" @click="showSaveManage = true">
        <i class="fas fa-folder-open"></i>
        载入存档
      </button>
      <button class="mg-btn mg-btn--secondary" @click="showSettings = true">
        <i class="fas fa-sliders-h"></i>
        提示词设置
      </button>
      <button class="mg-btn mg-btn--secondary" @click="showApiSettings = true">
        <i class="fas fa-plug"></i>
        API 设置
      </button>
      <button
        class="mg-btn mg-btn--secondary"
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
          <!-- TODO: 等待实现的功能 — 系统设置面板（主题、字号、音量调整） -->
          <div class="mg-system-settings">
            <div class="mg-system-settings__section">
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
            <p class="mg-system-settings__todo">
              <i class="fas fa-info-circle"></i>
              // TODO: 等待实现的功能 — 字号调整、音量控制
            </p>
            <div class="mg-system-settings__section">
              <h3><i class="fas fa-bolt"></i> 性能设置</h3>
              <p class="mg-system-settings__hint">PixiJS WebGL 背景特效对首次加载影响较大，可在低性能设备上关闭。</p>
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
// SplashScreen — MagicalGirl Shell
// ============================================================

.mg-splash {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--mg-space-2xl, 48px) var(--mg-space-lg, 24px);
  text-align: center;
  z-index: 1;
}

// ── Fullscreen toggle ──
.mg-splash__fullscreen-btn {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: var(--mg-z-overlay, 100);
  width: 40px;
  height: 40px;
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-bg-card, #2d2d2d);
  color: var(--mg-text-secondary, #c9a0dc);
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--mg-transition-fast, 150ms ease);

  &:hover {
    color: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent, #ff6b9d);
    box-shadow: var(--mg-glow-pink);
  }
}

// ── Hero ──
.mg-splash__hero {
  margin-bottom: var(--mg-space-xl, 32px);
}

.mg-splash__logo-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: var(--mg-space-md, 16px);
}

.mg-splash__logo {
  max-width: 280px;
  width: 60vw;
  height: auto;
  filter: drop-shadow(0 0 12px rgba(255, 107, 157, 0.35));
}

.mg-splash__eyebrow {
  font-family: var(--mg-font-mono, monospace);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--mg-text-secondary, #c9a0dc);
  margin-bottom: var(--mg-space-md, 16px);
}

.mg-splash__title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: clamp(2.5rem, 8vw, 5rem);
  font-weight: 700;
  color: var(--mg-accent, #ff6b9d);
  text-shadow: var(--mg-glow-pink);
  margin: 0 0 var(--mg-space-md, 16px);
  line-height: 1.1;
}

.mg-splash__subtitle {
  max-width: 560px;
  margin: 0 auto;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--mg-text-secondary, #c9a0dc);
}

// ── Menu ──
.mg-splash__menu {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm, 8px);
  width: 100%;
  max-width: 320px;
}

// ── Buttons ──
.mg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 28px;
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius-pill, 999px);
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all
    var(--mg-transition-bounce, 300ms cubic-bezier(0.34, 1.56, 0.64, 1));
  color: var(--mg-text, #f5f0f6);
  background: var(--mg-bg-card, #2d2d2d);

  i {
    font-size: 0.95rem;
    width: 18px;
    text-align: center;
  }

  &:hover {
    transform: scale(1.03);
    border-color: var(--mg-accent, #ff6b9d);
  }

  &:active {
    transform: scale(0.97);
  }

  &--primary {
    background: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent-strong, #ff2d78);
    color: #fff;
    font-size: 1.05rem;
    padding: 16px 32px;

    &:hover {
      box-shadow: var(--mg-glow-pink);
      background: var(--mg-accent-strong, #ff2d78);
    }
  }

  &--secondary {
    &:hover {
      color: var(--mg-accent, #ff6b9d);
      box-shadow: var(--mg-glow-pink);
    }
  }
}

// ── Version ──
.mg-splash__version {
  margin-top: var(--mg-space-xl, 32px);
  font-size: 0.75rem;
  color: var(--mg-text-muted, #888);
}

// ── Modal styles (inline, will be extracted to _modal.scss in Step 12) ──
.mg-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--mg-z-modal, 200);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mg-bg-overlay, rgba(26, 26, 26, 0.94));
  animation: mg-fade-in 200ms ease;
}

.mg-modal-card {
  position: relative;
  background: var(--mg-bg-card, #2d2d2d);
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius, 16px);
  box-shadow: var(--mg-shadow-style);
  max-height: 85vh;
  width: 90vw;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  animation: mg-scale-in 250ms
    var(--mg-transition-bounce, cubic-bezier(0.34, 1.56, 0.64, 1));

  &--wide {
    max-width: 720px;
  }
}

.mg-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--mg-text-secondary, #c9a0dc);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--mg-transition-fast, 150ms ease);
  z-index: 1;

  &:hover {
    color: var(--mg-accent, #ff6b9d);
    background: var(--mg-surface-pink);
  }
}

.mg-modal__title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--mg-text, #f5f0f6);
  padding: 20px 24px 0;
  margin: 0;
}

.mg-modal__body {
  padding: 20px 24px 24px;
  overflow-y: auto;
  flex: 1;
}

// ── System Settings ──
.mg-system-settings {
  &__section {
    margin-bottom: var(--mg-space-lg, 24px);

    h3 {
      font-size: 1rem;
      margin-bottom: var(--mg-space-sm, 8px);
      color: var(--mg-text, #f5f0f6);
    }
  }

  &__todo {
    font-size: 0.85rem;
    color: var(--mg-text-muted, #888);
    font-style: italic;
    margin-top: var(--mg-space-md, 16px);

    i {
      margin-right: 6px;
    }
  }
}

.mg-theme-options {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm, 8px);
}

.mg-theme-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border: var(--mg-border-width, 2px) solid
    var(--mg-border-light, rgba(255, 107, 157, 0.2));
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-surface-pink);
  color: var(--mg-text, #f5f0f6);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--mg-transition-fast, 150ms ease);

  &:hover {
    border-color: var(--mg-accent, #ff6b9d);
  }

  &--active {
    border-color: var(--mg-accent, #ff6b9d);
    background: var(--mg-accent, #ff6b9d);
    color: #fff;
  }
}

// ── Animations ──
@keyframes mg-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes mg-scale-in {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

// ── Toggle switch ──
.mg-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: var(--mg-space-sm, 8px);
  cursor: pointer;
  font-size: 0.88rem;
  color: var(--mg-text, #f5f0f6);

  input { display: none; }

  &--disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &__slider {
    position: relative;
    width: 40px;
    height: 22px;
    background: var(--mg-border-light, rgba(255, 107, 157, 0.2));
    border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
    border-radius: 11px;
    transition: all var(--mg-transition-fast, 150ms ease);
    flex-shrink: 0;

    &::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--mg-text-secondary, #c9a0dc);
      transition: all var(--mg-transition-fast, 150ms ease);
    }
  }

  input:checked + &__slider {
    background: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent-strong, #ff2d78);
    &::after { left: 20px; background: #fff; }
  }

  &__label { user-select: none; }
}

.mg-system-settings__hint {
  font-size: 0.78rem;
  color: var(--mg-text-muted, #888);
  margin: 0 0 var(--mg-space-sm, 8px);
  line-height: 1.5;
}
</style>
