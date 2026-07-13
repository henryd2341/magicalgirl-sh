<script setup lang="ts">
import type { TrainingPuzzleDefinition } from "@/types/training";
import { ref } from "vue";

const props = defineProps<{ puzzle: TrainingPuzzleDefinition; clueAvailable: boolean }>();
const emit = defineEmits<{ submit: [answer: string] }>();
const revealed = ref(false);
const answer = ref("");
</script>
<template>
  <section v-if="clueAvailable" class="training-puzzle" aria-labelledby="training-puzzle-title">
    <h3 id="training-puzzle-title">隐藏挑战线索</h3>
    <p v-if="!puzzle.enabled">谜题尚未开放</p>
    <template v-else>
      <button v-if="!revealed" type="button" @click="revealed = true">查看线索</button>
      <form
        v-else
        :data-puzzle-resource="props.puzzle.imageUrl ?? undefined"
        @submit.prevent="emit('submit', answer)"
      >
        <p>{{ puzzle.clueText }}</p>
        <p class="training-hint">提示：可在浏览器 DevTools 中寻找图片资源。</p>
        <label for="training-puzzle-answer">谜题答案</label>
        <input id="training-puzzle-answer" v-model="answer" autocomplete="off" />
        <button type="submit">提交答案</button>
      </form>
    </template>
  </section>
</template>
