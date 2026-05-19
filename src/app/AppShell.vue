<template>
  <div
    id="application-shell"
    class="app-shell-frame"
    role="application"
    aria-label="MagicalGirl Application Shell"
  >
    <div class="ambient-layer ambient-layer--confetti" aria-hidden="true"></div>
    <div class="ambient-layer ambient-layer--checker" aria-hidden="true"></div>
    <div class="ambient-layer ambient-layer--glow" aria-hidden="true"></div>
    <div class="app-shell">
      <slot>
        <RouterView />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
</script>
