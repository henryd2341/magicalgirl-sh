<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useSessionStore } from "@/stores/sessionStore";
import { storeToRefs } from "pinia";
import {
  isPlaying,
  currentTime,
  duration,
  currentCategory,
  currentTrack,
  currentPlaylist,
  play,
  pause,
  prepareTrack,
  findSceneTrack,
  findBattleTrack,
  cycleNext,
  cyclePrev,
  setPlaylist,
  switchToBattle,
  resumeScene,
} from "@/composables/useAudio";

const sessionStore = useSessionStore();
const { snapshot } = storeToRefs(sessionStore);

// ── UI state ──
const playlistOpen = ref(false);
const showAutoplayOverlay = ref(false);
const currentCategoryLabel = computed(() =>
  currentCategory.value === "battle" ? "战斗" : "场景"
);

// ── Scene music auto-switch ──
let lastLocation = "";
let lastTimeOfDay: "day" | "night" = "day";

watch(
  () => snapshot.value,
  async () => {
    const vars = await sessionStore.getVariableSnapshot();
    if (!vars?.root) return;

    // Only handle scene music if not in combat
    if (snapshot.value.sessionState === "IN_COMBAT") return;

    const location = vars.root.world?.location?.name || "";
    const timeVal = vars.root.world?.time;
    let timeOfDay: "day" | "night" = "day";
    if (timeVal?.timeSlot) {
      const s = timeVal.timeSlot.toLowerCase();
      if (s.includes("night") || s.includes("evening") || s.includes("夜") || s.includes("晚")) {
        timeOfDay = "night";
      }
    }
    if (timeOfDay === "day" && timeVal?.displayText) {
      if (timeVal.displayText.includes("夜") || timeVal.displayText.includes("晚") || /night|evening/i.test(timeVal.displayText)) {
        timeOfDay = "night";
      }
    }

    if (location === lastLocation && timeOfDay === lastTimeOfDay) return;
    lastLocation = location;
    lastTimeOfDay = timeOfDay;

    // Find matching scene tracks
    const tracks = findSceneTrack(location, timeOfDay);
    if (tracks.length === 0) return;

    setPlaylist(tracks, 0);

    if (prepareTrack(tracks[0])) {
      await play();
      if (!isPlaying.value) showAutoplayOverlay.value = true;
    }
  },
  { deep: true, immediate: true }
);

// ── Battle music auto-switch ──
let wasInCombat = false;

watch(
  () => snapshot.value.sessionState,
  async (newState) => {
    if (newState === "IN_COMBAT" && !wasInCombat) {
      // Entering combat: pause scene, play battle music
      const vars = await sessionStore.getVariableSnapshot();
      const level = vars?.root?.player?.combat?.level ?? 1;
      const track = findBattleTrack(level);
      switchToBattle(track);
      wasInCombat = true;
    } else if (newState !== "IN_COMBAT" && wasInCombat) {
      // Exiting combat: resume scene music
      resumeScene(undefined, true);
      wasInCombat = false;
    }
  },
  { immediate: true },
);

// ── Autoplay handling ──
onMounted(async () => {
  // Try to play if there's already a track set
  if (currentTrack.value) {
    try {
      await play();
    } catch {
      showAutoplayOverlay.value = true;
    }
  }
});

function handleClickToPlay() {
  showAutoplayOverlay.value = false;
  play();
}

// ── Progress bar interaction ──
function onSeek(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  currentTime.value = val;
}
</script>

<template>
  <div class="mg-card mg-card--sm mg-bgm">
    <!-- Autoplay blocked overlay -->
    <div v-if="showAutoplayOverlay" class="mg-bgm__autoplay-overlay" @click="handleClickToPlay">
      <i class="fas fa-play-circle"></i>
      <span>点击播放音乐</span>
    </div>

    <!-- Player controls -->
    <div class="mg-bgm__controls">
      <button class="mg-bgm__btn" @click="cyclePrev()" title="上一首">
        <i class="fas fa-step-backward"></i>
      </button>
      <button class="mg-bgm__btn mg-bgm__btn--play" @click="isPlaying ? pause() : play()" :title="isPlaying ? '暂停' : '播放'">
        <i :class="isPlaying ? 'fas fa-pause' : 'fas fa-play'"></i>
      </button>
      <button class="mg-bgm__btn" @click="cycleNext()" title="下一首">
        <i class="fas fa-step-forward"></i>
      </button>
    </div>

    <!-- Progress bar -->
    <div class="mg-bgm__progress">
      <input
        type="range"
        class="mg-bgm__seek"
        min="0"
        :max="duration || 0"
        :value="currentTime"
        @input="onSeek"
        step="0.1"
      />
    </div>

    <!-- Status row: category tag + playlist toggle -->
    <div class="mg-bgm__status">
      <span v-if="isPlaying" class="mg-bgm__playing-indicator">
        <i class="fas fa-volume-up"></i>
      </span>
      <span v-else class="mg-bgm__paused-indicator">
        <i class="fas fa-volume-off"></i>
      </span>
      <span class="mg-bgm__category-tag">{{ currentCategoryLabel }}</span>
      <button
        class="mg-bgm__playlist-toggle"
        @click="playlistOpen = !playlistOpen"
        :title="playlistOpen ? '收起列表' : '播放列表'"
      >
        <i :class="playlistOpen ? 'fas fa-chevron-up' : 'fas fa-list'"></i>
      </button>
    </div>

    <!-- Expandable playlist -->
    <div v-if="playlistOpen" class="mg-bgm__playlist">
      <div
        v-for="(track, idx) in currentPlaylist"
        :key="idx"
        class="mg-bgm__playlist-item"
        :class="{ 'mg-bgm__playlist-item--active': track === currentTrack }"
      >
        <span class="mg-bgm__playlist-num">{{ idx + 1 }}</span>
        <span class="mg-bgm__playlist-track">Track {{ track }}</span>
        <span v-if="track === currentTrack && isPlaying" class="mg-bgm__playlist-now">
          <i class="fas fa-play"></i>
        </span>
      </div>
      <div v-if="currentPlaylist.length === 0" class="mg-bgm__playlist-empty">
        暂无曲目
      </div>
    </div>
  </div>
</template>
