<template>
  <div
    id="application-shell"
    class="mg-app-shell-frame"
    role="application"
    aria-label="MagicalGirl Application Shell"
  >
    <!-- PixiJS WebGL background (replaces CSS ambient layers) -->
    <PixiBackground />
    <!-- CSS fallback layers (hidden, kept as fallback) -->
    <div class="ambient-layer ambient-layer--confetti" aria-hidden="true" style="display: none"></div>
    <div class="ambient-layer ambient-layer--checker" aria-hidden="true" style="display: none"></div>
    <div class="ambient-layer ambient-layer--glow" aria-hidden="true" style="display: none"></div>
    <div class="mg-app-shell">
      <slot>
        <KeepAlive>
          <RouterView />
        </KeepAlive>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import PixiBackground from "@/ui/background/PixiBackground.vue";
</script>
