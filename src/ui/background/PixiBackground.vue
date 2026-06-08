<template>
  <div ref="canvasHost" class="mg-pixi-bg" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { PixiEffects } from "./pixiEffects";

const canvasHost = ref<HTMLDivElement>();

let effects: PixiEffects | null = null;

function getColorScheme(): "e-girl" | "kidcore" | "pastel-brutalism" {
  const theme = document.documentElement.dataset.theme;
  if (theme === "kidcore") return "kidcore";
  if (theme === "pastel-brutalism") return "pastel-brutalism";
  return "e-girl";
}

function onThemeChange() {
  if (!effects) return;
  effects.destroy();
  mountEffects();
}

async function mountEffects() {
  if (!canvasHost.value) return;
  effects = new PixiEffects();
  try {
    await effects.init({
      container: canvasHost.value,
      particles: true,
      colorScheme: getColorScheme(),
    });
  } catch {
    console.warn("PixiJS background failed to initialize, using CSS fallback.");
  }
}

onMounted(() => {
  mountEffects();
  window.addEventListener("mg-theme-change", onThemeChange);
});

onUnmounted(() => {
  window.removeEventListener("mg-theme-change", onThemeChange);
  effects?.destroy();
});
</script>

<style lang="scss" scoped>
.mg-pixi-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;

  canvas {
    display: block;
  }
}
</style>
