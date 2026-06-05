<template>
  <div ref="canvasHost" class="mg-pixi-bg" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { PixiEffects } from "./pixiEffects";

const canvasHost = ref<HTMLDivElement>();

let effects: PixiEffects | null = null;

onMounted(async () => {
  if (!canvasHost.value) return;
  effects = new PixiEffects();
  try {
    await effects.init({
      container: canvasHost.value,
      particles: true,
      glow: true,
    });
  } catch {
    // PixiJS init failed — CSS fallback layers still active
    console.warn("PixiJS background failed to initialize, using CSS fallback.");
  }
});

onUnmounted(() => {
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
    width: 100%;
    height: 100%;
  }
}
</style>
