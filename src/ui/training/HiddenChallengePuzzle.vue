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
    <h3 id="training-puzzle-title"></h3>
    <p v-if="!puzzle.enabled"></p>
    <template v-else>
      <button v-if="!revealed" type="button" @click="revealed = true">&nbsp;</button>
      <form
        v-else
        :data-puzzle-resource="props.puzzle.imageUrl ?? undefined"
        @submit.prevent="emit('submit', answer)"
      >
        <p>{{ puzzle.clueText }}</p>
        <p class="training-hint">温馨提醒：记得存档！</p>
        <label for="training-puzzle-answer">答案</label>
        <input id="training-puzzle-answer" v-model="answer" autocomplete="off" />
        <button type="submit">提交</button>
      </form>
    </template>
  </section>
</template>
