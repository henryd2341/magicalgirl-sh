import {
  BATTLE_BROADCAST_STORAGE_KEY,
  DEFAULT_BATTLE_BROADCAST_PREFERENCES,
  clampBattleBroadcastPreferences,
  useBattleBroadcastPreferences,
} from "@/composables/useBattleBroadcastPreferences";
import { beforeEach, describe, expect, it } from "vitest";

describe("battle broadcast preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses versioned defaults when no valid saved preferences exist", () => {
    expect(DEFAULT_BATTLE_BROADCAST_PREFERENCES).toEqual({
      version: 1,
      x: 24,
      y: 24,
      width: 380,
      height: 320,
      minimized: false,
      density: "compact",
    });

    localStorage.setItem(BATTLE_BROADCAST_STORAGE_KEY, "{broken");
    expect(useBattleBroadcastPreferences().preferences.value).toEqual(
      DEFAULT_BATTLE_BROADCAST_PREFERENCES,
    );

    localStorage.setItem(
      BATTLE_BROADCAST_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_BATTLE_BROADCAST_PREFERENCES,
        version: 2,
        x: 99,
      }),
    );
    expect(useBattleBroadcastPreferences().preferences.value).toEqual(
      DEFAULT_BATTLE_BROADCAST_PREFERENCES,
    );
  });

  it("saves updates and reloads them", () => {
    const first = useBattleBroadcastPreferences({
      width: 1280,
      height: 720,
    });

    first.updatePreferences({
      x: 120,
      y: 80,
      width: 460,
      height: 360,
      minimized: true,
      density: "detail",
    });

    expect(useBattleBroadcastPreferences({
      width: 1280,
      height: 720,
    }).preferences.value).toEqual({
      version: 1,
      x: 120,
      y: 80,
      width: 460,
      height: 360,
      minimized: true,
      density: "detail",
    });
  });

  it("clamps size and keeps at least 44 pixels of the header visible", () => {
    expect(
      clampBattleBroadcastPreferences(
        {
          ...DEFAULT_BATTLE_BROADCAST_PREFERENCES,
          x: 9999,
          y: 9999,
          width: 9999,
          height: 9999,
        },
        { width: 1000, height: 600 },
      ),
    ).toEqual({
      version: 1,
      x: 956,
      y: 556,
      width: 720,
      height: 420,
      minimized: false,
      density: "compact",
    });

    const left = clampBattleBroadcastPreferences(
      {
        ...DEFAULT_BATTLE_BROADCAST_PREFERENCES,
        x: -9999,
        y: -9999,
        width: 300,
        height: 100,
      },
      { width: 1000, height: 600 },
    );

    expect(left).toMatchObject({
      x: -256,
      y: 0,
      width: 300,
      height: 180,
    });
  });
});
