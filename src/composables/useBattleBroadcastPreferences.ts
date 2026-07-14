import { ref, type Ref } from "vue";

export const BATTLE_BROADCAST_STORAGE_KEY =
  "magicalgirl:battle-broadcast:v1";

export const DEFAULT_BATTLE_BROADCAST_PREFERENCES = {
  version: 1 as const,
  x: 24,
  y: 24,
  width: 380,
  height: 320,
  minimized: false,
  density: "compact" as const,
};

export type BattleBroadcastDensity = "compact" | "detail";

export interface BattleBroadcastPreferences {
  version: 1;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  density: BattleBroadcastDensity;
}

export interface BattleBroadcastViewport {
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function cloneDefaults(): BattleBroadcastPreferences {
  return { ...DEFAULT_BATTLE_BROADCAST_PREFERENCES };
}

function getCurrentViewport(): BattleBroadcastViewport {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function clampBattleBroadcastPreferences(
  input: BattleBroadcastPreferences,
  viewport: BattleBroadcastViewport,
): BattleBroadcastPreferences {
  const safeViewport = {
    width: Math.max(1, viewport.width),
    height: Math.max(1, viewport.height),
  };
  const maximumWidth = Math.max(
    1,
    Math.min(720, safeViewport.width - 16),
  );
  const minimumWidth = Math.min(280, maximumWidth);
  const maximumHeight = Math.max(
    1,
    Math.min(safeViewport.height * 0.7, safeViewport.height - 16),
  );
  const minimumHeight = Math.min(180, maximumHeight);
  const width = clamp(input.width, minimumWidth, maximumWidth);
  const height = clamp(input.height, minimumHeight, maximumHeight);

  return {
    ...input,
    width,
    height,
    x: clamp(input.x, 44 - width, safeViewport.width - 44),
    y: clamp(input.y, 0, Math.max(0, safeViewport.height - 44)),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePreferences(value: string | null): BattleBroadcastPreferences | null {
  if (value == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<BattleBroadcastPreferences>;
    if (
      parsed.version !== 1 ||
      !isFiniteNumber(parsed.x) ||
      !isFiniteNumber(parsed.y) ||
      !isFiniteNumber(parsed.width) ||
      !isFiniteNumber(parsed.height) ||
      typeof parsed.minimized !== "boolean" ||
      (parsed.density !== "compact" && parsed.density !== "detail")
    ) {
      return null;
    }

    return parsed as BattleBroadcastPreferences;
  } catch {
    return null;
  }
}

function readPreferences(): BattleBroadcastPreferences | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    return parsePreferences(localStorage.getItem(BATTLE_BROADCAST_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writePreferences(preferences: BattleBroadcastPreferences): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      BATTLE_BROADCAST_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Browsers may reject storage in private or quota-limited contexts.
  }
}

export function useBattleBroadcastPreferences(
  viewport: BattleBroadcastViewport = getCurrentViewport(),
): {
  preferences: Ref<BattleBroadcastPreferences>;
  updatePreferences: (
    patch: Partial<Omit<BattleBroadcastPreferences, "version">>,
    nextViewport?: BattleBroadcastViewport,
  ) => void;
  resetPreferences: (nextViewport?: BattleBroadcastViewport) => void;
} {
  const preferences = ref(
    clampBattleBroadcastPreferences(
      readPreferences() ?? cloneDefaults(),
      viewport,
    ),
  ) as Ref<BattleBroadcastPreferences>;

  function updatePreferences(
    patch: Partial<Omit<BattleBroadcastPreferences, "version">>,
    nextViewport: BattleBroadcastViewport = getCurrentViewport(),
  ): void {
    preferences.value = clampBattleBroadcastPreferences(
      {
        ...preferences.value,
        ...patch,
        version: 1,
      },
      nextViewport,
    );
    writePreferences(preferences.value);
  }

  function resetPreferences(
    nextViewport: BattleBroadcastViewport = getCurrentViewport(),
  ): void {
    preferences.value = clampBattleBroadcastPreferences(
      cloneDefaults(),
      nextViewport,
    );
    writePreferences(preferences.value);
  }

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  };
}
