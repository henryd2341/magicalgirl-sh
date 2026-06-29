<script setup lang="ts">
import { useRouter } from "vue-router";
import { ref, onMounted, onUnmounted } from "vue";

defineEmits<{
  openPromptSettings: [];
  openApiSettings: [];
  openSaveManage: [];
  openSystemSettings: [];
  openInventory: [];
  openShop: [];
}>();

const router = useRouter();
const menuOpen = ref(false);
const isMobile = ref(false);

let mql: MediaQueryList | null = null;

function onMediaChange(e: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = e.matches;
  if (!e.matches) menuOpen.value = false;
}

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
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

onMounted(() => {
  mql = window.matchMedia("(max-width: 767px)");
  onMediaChange(mql);
  mql.addEventListener("change", onMediaChange);
  document.addEventListener("fullscreenchange", onFullscreenChange);
});

onUnmounted(() => {
  mql?.removeEventListener("change", onMediaChange);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
});

function returnToTitle() {
  router.push({ name: "title" });
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}
</script>

<template>
  <header
    id="game-top-bar"
    class="mg-topbar"
    aria-label="主游戏顶部栏"
  >
    <span class="mg-topbar__title" data-text="SWEET HEART">SWEET HEART</span>
    <!-- Desktop nav -->
    <nav v-if="!isMobile" class="mg-topbar__actions" aria-label="主游戏快捷操作">
      <button class="mg-topbar__btn" title="背包" type="button" @click="$emit('openInventory')">
        <i class="fas fa-bag-shopping"></i>
        <span>背包</span>
      </button>
      <span class="mg-topbar__sep" aria-hidden="true">♡</span>
      <button class="mg-topbar__btn" title="商店" type="button" @click="$emit('openShop')">
        <i class="fas fa-store"></i>
        <span>商店</span>
      </button>
      <span class="mg-topbar__sep" aria-hidden="true">♡</span>
      <button class="mg-topbar__btn" title="训练场" type="button">
        <i class="fas fa-dumbbell"></i>
        <span>训练场</span>
      </button>
      <span class="mg-topbar__sep mg-topbar__sep--divider" aria-hidden="true"></span>
      <button class="mg-topbar__btn" title="存档/读档" type="button" @click="$emit('openSaveManage')">
        <i class="fas fa-save"></i>
        <span>存档</span>
      </button>
      <span class="mg-topbar__sep" aria-hidden="true">♡</span>
      <button class="mg-topbar__btn" title="提示词设置 (Prompt Builder)" type="button" @click="$emit('openPromptSettings')">
        <i class="fas fa-book-open"></i>
        <span>提示词</span>
      </button>
      <span class="mg-topbar__sep" aria-hidden="true">♡</span>
      <button class="mg-topbar__btn" title="API 设置" type="button" @click="$emit('openApiSettings')">
        <i class="fas fa-plug"></i>
        <span>API</span>
      </button>
      <span class="mg-topbar__sep" aria-hidden="true">♡</span>
      <button class="mg-topbar__btn" title="系统设置" type="button" @click="$emit('openSystemSettings')">
        <i class="fas fa-cog"></i>
        <span>系统</span>
      </button>
      <span class="mg-topbar__sep mg-topbar__sep--divider" aria-hidden="true"></span>
      <button class="mg-topbar__btn" title="返回标题页" type="button" @click="returnToTitle">
        <i class="fas fa-home"></i>
        <span>标题</span>
      </button>
      <span class="mg-topbar__sep mg-topbar__sep--divider" aria-hidden="true"></span>
      <button
        class="mg-topbar__btn"
        :title="isFullscreen ? '退出全屏' : '全屏模式'"
        type="button"
        @click="toggleFullscreen"
      >
        <i :class="isFullscreen ? 'fas fa-compress' : 'fas fa-expand'"></i>
      </button>
    </nav>
    <!-- Mobile hamburger -->
    <button v-else class="mg-topbar__hamburger" @click="toggleMenu" :aria-label="menuOpen ? '关闭菜单' : '打开菜单'">
      <i :class="menuOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
    </button>
    <!-- Mobile dropdown menu -->
    <nav v-if="isMobile && menuOpen" class="mg-topbar__dropdown" aria-label="移动端游戏菜单">
      <button class="mg-topbar__dropdown-btn" title="背包" type="button" @click="$emit('openInventory'); closeMenu()">
        <i class="fas fa-backpack"></i> 背包
      </button>
      <button class="mg-topbar__dropdown-btn" title="商店" type="button" @click="$emit('openShop'); closeMenu()">
        <i class="fas fa-store"></i> 商店
      </button>
      <button class="mg-topbar__dropdown-btn" title="训练场" type="button" @click="closeMenu">
        <i class="fas fa-dumbbell"></i> 训练场
      </button>
      <hr class="mg-topbar__dropdown-divider" />
      <button class="mg-topbar__dropdown-btn" title="存档/读档" type="button" @click="$emit('openSaveManage'); closeMenu()">
        <i class="fas fa-save"></i> 存档
      </button>
      <button class="mg-topbar__dropdown-btn" title="提示词设置" type="button" @click="$emit('openPromptSettings'); closeMenu()">
        <i class="fas fa-book-open"></i> 提示词
      </button>
      <button class="mg-topbar__dropdown-btn" title="API 设置" type="button" @click="$emit('openApiSettings'); closeMenu()">
        <i class="fas fa-plug"></i> API
      </button>
      <button class="mg-topbar__dropdown-btn" title="系统设置" type="button" @click="$emit('openSystemSettings'); closeMenu()">
        <i class="fas fa-cog"></i> 系统
      </button>
      <hr class="mg-topbar__dropdown-divider" />
      <button
        class="mg-topbar__dropdown-btn"
        :title="isFullscreen ? '退出全屏' : '全屏模式'"
        type="button"
        @click="toggleFullscreen(); closeMenu()"
      >
        <i :class="isFullscreen ? 'fas fa-compress' : 'fas fa-expand'"></i> 全屏
      </button>
      <hr class="mg-topbar__dropdown-divider" />
      <button class="mg-topbar__dropdown-btn" title="返回标题页" type="button" @click="returnToTitle(); closeMenu()">
        <i class="fas fa-home"></i> 标题
      </button>
    </nav>
  </header>
</template>

<style lang="scss" scoped>
.mg-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--mg-bg-card, #2d2d2d);
  border-bottom: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  z-index: var(--mg-z-content, 10);
  flex-shrink: 0;
}

.mg-topbar__title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--mg-accent, #ff6b9d);
}

.mg-topbar__actions {
  display: flex;
  gap: 4px;
}

.mg-topbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: var(--mg-border-width, 2px) solid transparent;
  border-radius: var(--mg-radius-sm, 8px);
  background: transparent;
  color: var(--mg-text-secondary, #c9a0dc);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--mg-transition-fast, 150ms ease);
  white-space: nowrap;

  &:hover {
    border-color: var(--mg-accent, #ff6b9d);
    color: var(--mg-accent, #ff6b9d);
    box-shadow: var(--mg-glow-pink);
  }

  i { font-size: 0.85rem; }
}

.mg-topbar__sep {
  color: var(--mg-accent);
  font-size: 0.5rem;
  opacity: 0.4;
  user-select: none;
  display: flex;
  align-items: center;

  &--divider {
    width: 4px;
    font-size: 0;
    opacity: 0.25;
    background: var(--mg-border-light);
    border-radius: 2px;
    margin: 0 4px;
    align-self: stretch;
  }
}

// ═══════════════════════════════════════════
// Mobile hamburger & dropdown
// ═══════════════════════════════════════════
.mg-topbar__hamburger {
  display: none;
  width: 40px;
  height: 40px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius-sm);
  background: transparent;
  color: var(--mg-accent);
  font-size: 1.2rem;
  cursor: pointer;
  transition: all var(--mg-transition-fast);

  &:hover {
    border-color: var(--mg-accent);
    box-shadow: var(--mg-glow-pink);
  }
}

.mg-topbar__dropdown {
  position: fixed;
  top: 52px;
  right: 8px;
  z-index: var(--mg-z-overlay, 100);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius-md);
  background: var(--mg-bg-card);
  box-shadow: var(--mg-shadow-sticker);
  min-width: 180px;
}

.mg-topbar__dropdown-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-radius: var(--mg-radius-sm);
  background: transparent;
  color: var(--mg-text);
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--mg-surface-pink, rgba(255, 107, 157, 0.15));
    color: var(--mg-accent);
  }

  i {
    width: 20px;
    text-align: center;
  }
}

.mg-topbar__dropdown-divider {
  border: none;
  border-top: var(--mg-border-width) solid var(--mg-border);
  margin: 4px 0;
  opacity: 0.5;
}

// ── Mobile breakpoint ──
@media (max-width: 767px) {
  .mg-topbar__hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mg-topbar__actions {
    display: none;
  }

  .mg-topbar__title {
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50vw;
  }
}
</style>
