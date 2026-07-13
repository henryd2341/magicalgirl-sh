<script setup lang="ts">
import type { ResolvedEnemyContent } from "@/types/content";

defineProps<{
  enemies: ResolvedEnemyContent[];
  selected: ResolvedEnemyContent[];
  searchQuery: string;
}>();
const emit = defineEmits<{
  "update:searchQuery": [value: string];
  add: [enemyId: string];
  remove: [index: number];
}>();
</script>

<template>
  <div class="training-free">
    <section class="training-panel" aria-labelledby="training-enemy-heading">
      <h3 id="training-enemy-heading">选择敌人</h3>
      <label for="training-enemy-search">搜索敌人</label>
      <input
        id="training-enemy-search"
        type="search"
        :value="searchQuery"
        placeholder="输入名称或 ID"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
      <ul class="training-list">
        <li v-for="enemy in enemies" :key="enemy.id">
          <span><strong>{{ enemy.name }}</strong><small>Lv.{{ enemy.baseLevel }}</small></span>
          <button type="button" :aria-label="`添加 ${enemy.name}`" @click="emit('add', enemy.id)">添加</button>
        </li>
      </ul>
    </section>

    <section class="training-panel" aria-labelledby="training-lineup-heading">
      <h3 id="training-lineup-heading">训练阵容 <small>{{ selected.length }}/4</small></h3>
      <p v-if="selected.length === 0" class="training-empty">选择 1–4 名不高于主角等级的敌人。</p>
      <ol v-else class="training-list training-list--selected">
        <li v-for="(enemy, index) in selected" :key="`${enemy.id}-${index}`">
          <span><strong>{{ index + 1 }}. {{ enemy.name }}</strong><small>Lv.{{ enemy.baseLevel }}</small></span>
          <button type="button" :aria-label="`移除第 ${index + 1} 个 ${enemy.name}`" @click="emit('remove', index)">移除</button>
        </li>
      </ol>
    </section>
  </div>
</template>
