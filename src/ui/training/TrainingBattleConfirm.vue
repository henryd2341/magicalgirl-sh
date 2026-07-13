<script setup lang="ts">
defineProps<{ busy: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>
<template>
  <div class="training-confirm" role="alertdialog" aria-modal="true" aria-labelledby="training-confirm-title">
    <div class="training-confirm__card">
      <h3 id="training-confirm-title">确认进入训练？</h3>
      <p>训练内 HP、MP、状态与道具消耗均不会写入正式存档。</p>
      <div class="training-actions">
        <button type="button" @click="emit('cancel')">返回配置</button>
        <button type="button" class="mg-btn mg-btn--primary" :disabled="busy" @click="emit('confirm')">{{ busy ? '准备中…' : '开始训练' }}</button>
      </div>
    </div>
  </div>
</template>
