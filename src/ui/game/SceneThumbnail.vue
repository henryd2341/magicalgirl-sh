<template>
  <div class="mg-scene-thumb">
    <div
      v-if="loading"
      class="mg-scene-thumb__skeleton mg-skeleton-pulse"
      aria-busy="true"
    ></div>
    <div
      v-else-if="error || !matchedLocation || !imageUrl"
      class="mg-scene-thumb__placeholder"
    >
      <i class="fas fa-map-marker"></i>
      <span>未知地点</span>
    </div>
    <img
      v-else-if="!imgError"
      :src="imageUrl"
      :alt="matchedLocation"
      class="mg-scene-thumb__img"
      @error="imgError = true"
    />
    <div v-else class="mg-scene-thumb__placeholder">
      <i class="fas fa-map-marker"></i>
      <span>未知地点</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSessionStore } from "@/stores/sessionStore";
import type { VariableValueRecord } from "@/types/variables";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";

const sessionStore = useSessionStore();
const { snapshot: sessionSnapshot } = storeToRefs(sessionStore);

const loading = ref(true);
const error = ref(false);
const vars = ref<VariableValueRecord | null>(null);
const imgError = ref(false);

/** Substring key -> image filename (no extension). */
const LOCATION_IMAGE_MAP: Record<string, string> = {
  商: "商业街",
  中心: "购物中心",
  咖啡: "咖啡馆",
  书: "书店",
  文教: "文教区",
  学院: "学院",
  公园: "公园",
  老: "老城区",
  海: "海滩",
  塔: "灯塔",
  总部: "总部",
  家: "家",
};

const locationImages = import.meta.glob("../../assets/location/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

watch(
  () => sessionSnapshot.value?.sessionState,
  async () => {
    loading.value = true;
    error.value = false;
    imgError.value = false;
    try {
      const result = await sessionStore.getVariableSnapshot();
      vars.value = result;
      if (!result) error.value = true;
    } catch {
      error.value = true;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const locationName = computed(
  () => vars.value?.root?.world?.location?.name ?? "",
);

const matchedLocation = computed(() => {
  const name = locationName.value;
  if (!name) return null;
  const matchKey = Object.keys(LOCATION_IMAGE_MAP).find((key) =>
    name.includes(key),
  );
  return matchKey ? LOCATION_IMAGE_MAP[matchKey] : null;
});

const timeOfDay = computed(() => {
  const t = vars.value?.root?.world?.time;
  if (t?.timeSlot) {
    const s = t.timeSlot.toLowerCase();
    if (
      s.includes("night") ||
      s.includes("evening") ||
      s.includes("夜") ||
      s.includes("晚")
    )
      return "night";
  }
  if (t?.displayText) {
    if (
      t.displayText.includes("夜") ||
      t.displayText.includes("晚") ||
      /night|evening/i.test(t.displayText)
    )
      return "night";
  }
  return "day";
});

const imageUrl = computed(() => {
  const loc = matchedLocation.value;
  if (!loc) return "";
  return (
    locationImages[`../../assets/location/${timeOfDay.value}/${loc}.png`] ?? ""
  );
});
</script>

<style lang="scss" scoped>
.mg-scene-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--mg-radius);
  overflow: hidden;
  background: var(--mg-bg-card);
  position: relative;
}

.mg-scene-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mg-scene-thumb__skeleton {
  width: 100%;
  height: 100%;
  background: var(--mg-bg-card);
  animation: mg-skeleton-pulse 1.5s ease-in-out infinite;
}

.mg-scene-thumb__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: var(--mg-space-sm, 8px);
  color: var(--mg-text-secondary);
  font-size: var(--mg-font-sm, 0.85rem);

  i {
    font-size: 2rem;
    opacity: 0.5;
  }
}
</style>
