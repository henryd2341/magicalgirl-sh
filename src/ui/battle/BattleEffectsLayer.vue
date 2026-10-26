<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { createBattleEffectsRenderer, type EffectPlayback } from "./battleEffectsRenderer";
const host = ref<HTMLElement | null>(null);
let renderer: ReturnType<typeof createBattleEffectsRenderer> | undefined;
onMounted(() => {
  if (host.value) renderer = createBattleEffectsRenderer(host.value, host.value.closest<HTMLElement>("#battle-overlay") ?? host.value.parentElement!);
});
onBeforeUnmount(() => renderer?.dispose());
defineExpose({
  play: (input: EffectPlayback) => renderer?.play(input) ?? Promise.resolve().then(input.reveal),
  cancel: () => renderer?.cancel(),
});
</script>
<template><div ref="host" class="battle-effects-layer" aria-hidden="true" /></template>
