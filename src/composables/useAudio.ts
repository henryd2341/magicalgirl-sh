import { computed, ref, watch } from "vue";
import { MUSIC_BASE_URL } from "../env";

// ─── Module-level singleton ────────────────────────────────────────────────────

const audioElement = new window.Audio();
audioElement.crossOrigin = "anonymous";
const localStorage = window.localStorage;
audioElement.preload = "metadata";

// ─── Vite glob: local fallback tracks ──────────────────────────────────────────

const localGlobUrls: Record<string, string> = {
  ...(import.meta.glob("../assets/music/scene/*.mp3", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>),
  ...(import.meta.glob("../assets/music/battle/*.mp3", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>),
};

// ─── Hardcoded music lookup tables ─────────────────────────────────────────────

const SCENE_MUSIC_TABLE: Record<string, Record<string, string[]>> = {
  学: { day: ["015", "005"], night: ["002"] },
  公园: { day: ["023"], night: ["004"] },
  咖啡: { day: ["013"], night: ["019"] },
  中心: { day: ["012", "021"], night: ["009"] },
  商: { day: ["017"], night: ["016"] },
  老: { day: ["006"], night: ["007"] },
  总部: { day: ["011"], night: ["010"] },
  海: { day: ["001"], night: ["020"] },
  塔: { day: ["018"], night: ["008"] },
  家: { day: ["014"], night: ["003"] },
};

const BATTLE_MUSIC_TABLE: {
  normal: { min: number; max: number; track: string }[];
  training: string;
  tower: Record<string, string>;
} = {
  normal: [
    { min: 1, max: 5, track: "001" },
    { min: 5, max: 15, track: "007" },
    { min: 15, max: 30, track: "002" },
    { min: 30, max: 40, track: "010" },
    { min: 40, max: 50, track: "006" },
    { min: 60, max: Infinity, track: "004" },
  ],
  training: "009",
  tower: {
    stage1_2: "008",
    stage3_4: "011",
    finalBoss: "003",
    hiddenBoss: "005",
  },
};

// ─── Reactive state ────────────────────────────────────────────────────────────

export const currentTrack = ref<string>("");
export const isPlaying = ref<boolean>(false);
export const currentTime = ref<number>(0);
export const duration = ref<number>(0);
export const currentCategory = ref<"scene" | "battle">("scene");

// Volume
function readVolume(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
  } catch {
    // localStorage not available
  }
  return fallback;
}

export const sceneVolume = ref<number>(readVolume("mg-vol-scene", 0.7));
export const battleVolume = ref<number>(readVolume("mg-vol-battle", 0.8));
export const masterVolume = ref<number>(readVolume("mg-vol-master", 0.8));

// Paused scene track for resume after combat
let pausedSceneTrack = "";
let pausedSceneTime = 0;

// ─── Computed ──────────────────────────────────────────────────────────────────

export const effectiveVolume = computed(() => {
  const categoryVol =
    currentCategory.value === "battle" ? battleVolume.value : sceneVolume.value;
  return categoryVol * masterVolume.value;
});

// ─── Watchers: persist volume + apply to audio element ─────────────────────────

watch([sceneVolume, battleVolume, masterVolume, currentCategory], () => {
  persistVolume("mg-vol-scene", sceneVolume.value);
  persistVolume("mg-vol-battle", battleVolume.value);
  persistVolume("mg-vol-master", masterVolume.value);
  audioElement.volume = effectiveVolume.value;
});

watch(currentTime, (val) => {
  if (Math.abs(audioElement.currentTime - val) > 0.5) {
    audioElement.currentTime = val;
  }
});

function persistVolume(key: string, val: number): void {
  try {
    localStorage.setItem(key, String(val));
  } catch {
    // localStorage not available
  }
}

// Sync audio element events
audioElement.addEventListener("timeupdate", () => {
  currentTime.value = audioElement.currentTime;
});

audioElement.addEventListener("durationchange", () => {
  duration.value = audioElement.duration || 0;
});

audioElement.addEventListener("play", () => {
  isPlaying.value = true;
});

audioElement.addEventListener("pause", () => {
  isPlaying.value = false;
});

audioElement.addEventListener("ended", () => {
  cycleNext();
});

audioElement.addEventListener("error", () => {
  if (!MUSIC_BASE_URL) return;
  if (!currentTrack.value) return;
  const src = audioElement.src;
  if (!src || !src.startsWith(MUSIC_BASE_URL)) return;

  console.warn(
    `[useAudio] 远程音频加载失败，回退到本地: ${src}`,
  );
  const key = `../assets/music/${currentCategory.value}/${currentTrack.value}.mp3`;
  const localUrl = localGlobUrls[key];
  if (localUrl) {
    audioElement.src = localUrl;
    audioElement.play().catch(() => {});
  }
});

// Apply initial volume
audioElement.volume = effectiveVolume.value;

// ─── Track URL resolution ──────────────────────────────────────────────────────

export function resolveTrackUrl(
  category: "scene" | "battle",
  number: string,
): string {
  if (MUSIC_BASE_URL) {
    return `${MUSIC_BASE_URL}/${category}/${number}.mp3`;
  }
  const key = `../assets/music/${category}/${number}.mp3`;
  return localGlobUrls[key] || "";
}

// ─── Scene music lookup ────────────────────────────────────────────────────────

/** Known location keys ordered by specificity (longest first for fuzzy match). */
const LOCATION_KEYS = Object.keys(SCENE_MUSIC_TABLE).sort(
  (a, b) => b.length - a.length,
);

export function findSceneTrack(
  location: string,
  timeOfDay: "day" | "night",
): string[] {
  if (!location) return [];

  // "购物中心 and not 咖啡厅" rule
  if (location.includes("咖啡")) {
    const cafeEntry = SCENE_MUSIC_TABLE["咖啡"];
    return cafeEntry?.[timeOfDay] ?? [];
  }

  // Fuzzy substring matching: find first key contained in location text
  for (const key of LOCATION_KEYS) {
    if (location.includes(key)) {
      return SCENE_MUSIC_TABLE[key]?.[timeOfDay] ?? [];
    }
  }

  return [];
}

// ─── Battle music lookup ───────────────────────────────────────────────────────

export function findBattleTrack(level: number, combatType?: string): string {
  // Training
  if (combatType === "training") {
    return BATTLE_MUSIC_TABLE.training;
  }

  // Tower (training challenge)
  if (combatType === "tower") {
    // Determine tower stage from level ranges
    if (level <= 2) return BATTLE_MUSIC_TABLE.tower.stage1_2;
    if (level <= 4) return BATTLE_MUSIC_TABLE.tower.stage3_4;
    if (level <= 5) return BATTLE_MUSIC_TABLE.tower.finalBoss;
    return BATTLE_MUSIC_TABLE.tower.hiddenBoss;
  }

  // Normal level-based lookup
  for (const entry of BATTLE_MUSIC_TABLE.normal) {
    if (level >= entry.min && level < entry.max) {
      return entry.track;
    }
  }

  // Fallback: last entry
  const last = BATTLE_MUSIC_TABLE.normal[BATTLE_MUSIC_TABLE.normal.length - 1];
  return last?.track ?? "001";
}

// ─── Playback controls ─────────────────────────────────────────────────────────

export async function play(): Promise<void> {
  try {
    await audioElement.play();
  } catch (err) {
    if ((err as Error).name === "NotAllowedError") {
      // Autoplay blocked; caller should show click-to-play overlay
      isPlaying.value = false;
    }
  }
}

export function pause(): void {
  audioElement.pause();
}

export function prepareTrack(trackNumber: string): boolean {
  const url = resolveTrackUrl(currentCategory.value, trackNumber);
  if (url) {
    audioElement.src = url;
    currentTrack.value = trackNumber;
    return true;
  }
  return false;
}

// ─── Category switching ────────────────────────────────────────────────────────

export function switchToBattle(trackNumber: string): void {
  if (currentCategory.value === "scene" && currentTrack.value) {
    pausedScenePlaylist = [...currentPlaylist.value];
    pausedScenePlaylistIndex = playlistIndex;
    pausedSceneTrack = currentTrack.value;
    pausedSceneTime = audioElement.currentTime;
  }
  currentCategory.value = "battle";
  setPlaylist([trackNumber], 0);
  const url = resolveTrackUrl("battle", trackNumber);
  if (url) {
    audioElement.src = url;
    currentTrack.value = trackNumber;
    play();
  }
}

export function resumeScene(trackNumber?: string, restoreTime?: boolean): void {
  currentCategory.value = "scene";
  if (pausedScenePlaylist.length > 0) {
    currentPlaylist.value = pausedScenePlaylist;
    playlistIndex = pausedScenePlaylistIndex;
    pausedScenePlaylist = [];
  }
  const target = trackNumber || pausedSceneTrack || "001";
  const url = resolveTrackUrl("scene", target);
  if (url) {
    audioElement.src = url;
    currentTrack.value = target;
    if (restoreTime && pausedSceneTime > 0) {
      audioElement.currentTime = pausedSceneTime;
    }
    play();
  }
  pausedSceneTrack = "";
  pausedSceneTime = 0;
}

// ─── Playlist management ───────────────────────────────────────────────────────

export const currentPlaylist = ref<string[]>([]);
let playlistIndex = 0;

// Saved scene playlist for resume after combat
let pausedScenePlaylist: string[] = [];
let pausedScenePlaylistIndex = 0;

export function setPlaylist(tracks: string[], startIndex = 0): void {
  currentPlaylist.value = tracks;
  playlistIndex = startIndex;
}

export function cycleNext(): string | null {
  if (currentPlaylist.value.length === 0) return null;
  playlistIndex = (playlistIndex + 1) % currentPlaylist.value.length;
  const track = currentPlaylist.value[playlistIndex];
  const url = resolveTrackUrl(currentCategory.value, track);
  if (url) {
    audioElement.src = url;
    currentTrack.value = track;
    play();
  }
  return track;
}

export function cyclePrev(): string | null {
  if (currentPlaylist.value.length === 0) return null;
  playlistIndex =
    (playlistIndex - 1 + currentPlaylist.value.length) %
    currentPlaylist.value.length;
  const track = currentPlaylist.value[playlistIndex];
  const url = resolveTrackUrl(currentCategory.value, track);
  if (url) {
    audioElement.src = url;
    currentTrack.value = track;
    play();
  }
  return track;
}

// ─── Reset (for test isolation) ────────────────────────────────────────────────

export function reset(): void {
  audioElement.pause();
  audioElement.src = "";
  currentTrack.value = "";
  isPlaying.value = false;
  currentTime.value = 0;
  duration.value = 0;
  currentCategory.value = "scene";
  sceneVolume.value = 0.7;
  battleVolume.value = 0.8;
  masterVolume.value = 0.8;
  pausedSceneTrack = "";
  pausedSceneTime = 0;
  pausedScenePlaylist = [];
  pausedScenePlaylistIndex = 0;
  currentPlaylist.value = [];
  playlistIndex = 0;

  try {
    localStorage.removeItem("mg-vol-scene");
    localStorage.removeItem("mg-vol-battle");
    localStorage.removeItem("mg-vol-master");
  } catch {
    // localStorage not available
  }

  audioElement.volume = effectiveVolume.value;
}
