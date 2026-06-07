<script setup lang="ts">
import { fontSize, applyFontSize } from "@/composables/useFontSize";
import { sceneVolume, battleVolume, masterVolume } from "@/composables/useAudio";

function onFontSizeChange(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(val)) applyFontSize(val);
}

function onSceneVolChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val)) sceneVolume.value = val;
}

function onBattleVolChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val)) battleVolume.value = val;
}

function onMasterVolChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!isNaN(val)) masterVolume.value = val;
}
</script>

<template>
  <div class="mg-system-settings-panel">
    <!-- Font Size -->
    <div class="mg-sys-section">
      <h3 class="mg-sys-section__title">
        <i class="fas fa-font"></i> 字号调整
      </h3>
      <div class="mg-sys-slider">
        <span class="mg-sys-slider__label">12px</span>
        <input
          type="range"
          class="mg-sys-slider__input"
          min="12"
          max="24"
          step="1"
          :value="fontSize"
          @input="onFontSizeChange"
        />
        <span class="mg-sys-slider__label">24px</span>
        <span class="mg-sys-slider__value">{{ fontSize }}px</span>
      </div>
    </div>

    <!-- Volume Controls -->
    <div class="mg-sys-section">
      <h3 class="mg-sys-section__title">
        <i class="fas fa-volume-up"></i> 音量控制
      </h3>

      <div class="mg-sys-slider">
        <span class="mg-sys-slider__icon"><i class="fas fa-music"></i></span>
        <span class="mg-sys-slider__name">场景音量</span>
        <input
          type="range"
          class="mg-sys-slider__input mg-sys-slider__input--wide"
          min="0"
          max="1"
          step="0.05"
          :value="sceneVolume"
          @input="onSceneVolChange"
        />
        <span class="mg-sys-slider__value">{{ Math.round(sceneVolume * 100) }}%</span>
      </div>

      <div class="mg-sys-slider">
        <span class="mg-sys-slider__icon"><i class="fas fa-crosshairs"></i></span>
        <span class="mg-sys-slider__name">战斗音量</span>
        <input
          type="range"
          class="mg-sys-slider__input mg-sys-slider__input--wide"
          min="0"
          max="1"
          step="0.05"
          :value="battleVolume"
          @input="onBattleVolChange"
        />
        <span class="mg-sys-slider__value">{{ Math.round(battleVolume * 100) }}%</span>
      </div>

      <div class="mg-sys-slider">
        <span class="mg-sys-slider__icon"><i class="fas fa-volume-down"></i></span>
        <span class="mg-sys-slider__name">总音量</span>
        <input
          type="range"
          class="mg-sys-slider__input mg-sys-slider__input--wide"
          min="0"
          max="1"
          step="0.05"
          :value="masterVolume"
          @input="onMasterVolChange"
        />
        <span class="mg-sys-slider__value">{{ Math.round(masterVolume * 100) }}%</span>
      </div>
    </div>
  </div>
</template>
