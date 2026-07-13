<script setup lang="ts">
import { isChallengeUnlocked } from "@/engine/training/trainingRules";
import type { TrainingChallengeDefinition, TrainingProgress } from "@/types/training";

defineProps<{
  challenges: TrainingChallengeDefinition[];
  selectedId: string | null;
  progress: TrainingProgress;
}>();
const emit = defineEmits<{ select: [challengeId: string] }>();
</script>

<template>
  <section class="training-panel" aria-labelledby="training-challenge-heading">
    <h3 id="training-challenge-heading">挑战阶梯</h3>
    <ol class="challenge-ladder">
      <li v-for="challenge in challenges" :key="challenge.id">
        <button
          type="button"
          class="challenge-card"
          :class="{ 'challenge-card--selected': selectedId === challenge.id }"
          :disabled="!isChallengeUnlocked(challenge, progress)"
          :aria-pressed="selectedId === challenge.id"
          @click="emit('select', challenge.id)"
        >
          <span class="challenge-card__order">{{ challenge.hidden ? '隐' : challenge.order }}</span>
          <span><strong>{{ challenge.name }}</strong><small>{{ progress.clearedChallengeIds.includes(challenge.id) ? '已通关' : isChallengeUnlocked(challenge, progress) ? '可挑战' : '尚未解锁' }}</small></span>
        </button>
      </li>
    </ol>
  </section>
</template>
