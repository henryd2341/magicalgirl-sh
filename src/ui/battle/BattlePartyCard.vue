<script setup lang="ts">
import type { BattleParticipant } from "@/types/battle";
import BattleStatusEffects from "@/ui/battle/BattleStatusEffects.vue";

defineProps<{ player: BattleParticipant; avatar: string; acting: boolean; targetable: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <div class="battle-party-slot" :data-participant-id="player.id">
    <button
      type="button"
      class="battle-party-card"
      :class="{
        'battle-party-card--actor': acting,
        'battle-party-card--down': player.isDown,
        'battle-party-card--clickable': targetable,
      }"
      :disabled="!targetable"
      @click="targetable && emit('select', player.id)"
    >
      <img class="battle-party-card__avatar" :src="avatar" :alt="`${player.displayName} avatar`" />
      <span v-if="acting" class="battle-party-card__actor">当前行动者</span>
      <div class="battle-party-card__body">
        <p class="battle-party-card__name">{{ player.displayName }}</p>
        <div class="battle-party-card__bar">
          <span class="battle-party-card__bar-label">HP</span>
          <progress class="battle-party-card__hp" :value="player.hp.current" :max="player.hp.max" />
          <span class="battle-party-card__bar-nums">{{ player.hp.current }}/{{ player.hp.max }}</span>
        </div>
        <div class="battle-party-card__bar">
          <span class="battle-party-card__bar-label">MP</span>
          <progress class="battle-party-card__mp" :value="player.mp.current" :max="player.mp.max" />
          <span class="battle-party-card__bar-nums">{{ player.mp.current }}/{{ player.mp.max }}</span>
        </div>
        <span v-if="player.isDown || player.isActive === false" class="battle-party-card__condition">{{
          player.isDown ? "倒下" : "后备"
        }}</span>
      </div>
    </button>
    <BattleStatusEffects :effects="player.statusEffects ?? []" :owner-name="player.displayName" />
  </div>
</template>
