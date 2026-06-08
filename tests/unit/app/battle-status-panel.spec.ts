import BattleStatusPanel from "@/ui/battle/BattleStatusPanel.vue";
import type { BattleParticipant, PressTurnIcon } from "@/types/battle";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

const selectedEnemy: BattleParticipant = {
  id: "enemy-1",
  side: "enemy",
  displayName: "result-shadow",
  level: 3,
  hp: {
    current: 2,
    max: 4,
  },
  mp: {
    current: 0,
    max: 0,
  },
  isDown: false,
  isActive: true,
};

const pressTurnIcons: PressTurnIcon[] = [
  { id: "solid-1", state: "solid" },
  { id: "blink-1", state: "blinking" },
];

describe("BattleStatusPanel", () => {
  it("renders selected enemy level/name and press turn state", () => {
    render(BattleStatusPanel, {
      props: {
        selectedTarget: selectedEnemy,
        turnCount: 2,
        pressTurnIcons,
        ownerSide: "player",
        iconAssets: {
          player: { solid: "allyIcon.svg", bright: "allyIconBright.svg" },
          enemy: { solid: "enemyIcon.svg", bright: "enemyIconBright.svg" },
        },
      },
    });

    expect(screen.getByLabelText("敌人状态栏")).toHaveTextContent("LV 3");
    expect(screen.getByLabelText("敌人状态栏")).toHaveTextContent(
      "result-shadow",
    );
    expect(screen.getByLabelText("回合与 Press Turn 区域")).toHaveTextContent(
      "Turn 2",
    );
    expect(screen.getByLabelText("solid press turn icon")).toBeInTheDocument();
    expect(screen.getByLabelText("blinking press turn icon")).toBeInTheDocument();
  });
});
