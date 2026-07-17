import BattleBroadcastWindow from "@/ui/battle/BattleBroadcastWindow.vue";
import battleBroadcastSource from "@/ui/battle/BattleBroadcastWindow.vue?raw";
import type { BattleLogEntry } from "@/types/battle";
import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

Object.defineProperty(window, "PointerEvent", {
  configurable: true,
  writable: true,
  value: TestPointerEvent,
});

const entries: BattleLogEntry[] = [
  {
    id: "battle-log-1",
    sequence: 1,
    turnCount: 1,
    side: "system",
    kind: "system",
    visibility: "both",
    summary: "战斗开始",
  },
  {
    id: "battle-log-2",
    sequence: 2,
    turnCount: 1,
    side: "player",
    kind: "action",
    visibility: "both",
    summary: "魔法少女发动攻击",
    details: ["敌人受到 120 点伤害"],
  },
  {
    id: "battle-log-3",
    sequence: 3,
    turnCount: 1,
    side: "system",
    kind: "press_turn",
    visibility: "detail",
    summary: "Press Turn 图标减少",
  },
];

describe("BattleBroadcastWindow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("teleports a compact log to body and reveals detail entries on demand", async () => {
    render(BattleBroadcastWindow, {
      props: {
        entries,
        turnCount: 1,
      },
    });

    const windowElement = screen.getByRole("complementary", {
      name: "战斗播报",
    });
    expect(windowElement.parentElement).toBe(document.body);
    expect(screen.getByText("战斗开始")).toBeInTheDocument();
    expect(screen.queryByText("Press Turn 图标减少")).not.toBeInTheDocument();
    expect(screen.queryByText("敌人受到 120 点伤害")).not.toBeInTheDocument();

    await fireEvent.click(
      screen.getByRole("button", { name: "显示详细播报" }),
    );

    expect(screen.getByText("Press Turn 图标减少")).toBeInTheDocument();
    expect(screen.getByText("敌人受到 120 点伤害")).toBeInTheDocument();
  });

  it("does not auto-scroll and offers an unread badge plus manual jump", async () => {
    const view = render(BattleBroadcastWindow, {
      props: {
        entries,
        turnCount: 1,
      },
    });
    const log = screen.getByRole("log");

    Object.defineProperty(log, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(log, "clientHeight", {
      configurable: true,
      value: 100,
    });
    log.scrollTop = 0;
    await fireEvent.scroll(log);

    await view.rerender({
      entries: [
        ...entries,
        {
          id: "battle-log-4",
          sequence: 4,
          turnCount: 2,
          side: "enemy",
          kind: "action",
          visibility: "both",
          summary: "敌人发动攻击",
        },
      ],
      turnCount: 2,
    });

    expect(log.scrollTop).toBe(0);
    expect(screen.getByText("1 条新播报")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "跳到最新播报" }));

    expect(log.scrollTop).toBe(1000);
    expect(screen.queryByText("1 条新播报")).not.toBeInTheDocument();
  });

  it("minimizes, restores, drags only from the header, and supports keyboard movement", async () => {
    render(BattleBroadcastWindow, {
      props: {
        entries,
        turnCount: 1,
      },
    });

    const windowElement = screen.getByRole("complementary", {
      name: "战斗播报",
    });
    const log = screen.getByRole("log");
    const header = screen.getByRole("banner", { name: "拖动战斗播报窗口" });

    await fireEvent.pointerDown(log, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    });
    await fireEvent.pointerMove(log, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    expect(windowElement).toHaveStyle({ left: "24px", top: "24px" });

    await fireEvent.pointerDown(header, {
      pointerId: 2,
      clientX: 20,
      clientY: 20,
    });
    await fireEvent.pointerMove(window, {
      pointerId: 2,
      clientX: 60,
      clientY: 50,
    });
    await fireEvent.pointerUp(window, { pointerId: 2 });
    expect(windowElement).toHaveStyle({ left: "64px", top: "54px" });

    await fireEvent.keyDown(header, { key: "ArrowRight" });
    expect(windowElement).toHaveStyle({ left: "80px" });

    await fireEvent.click(screen.getByRole("button", { name: "最小化战斗播报" }));
    expect(
      screen.queryByRole("complementary", { name: "战斗播报" }),
    ).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "恢复战斗播报" }));
    expect(
      screen.getByRole("complementary", { name: "战斗播报" }),
    ).toBeInTheDocument();
  });

  it("drags the minimized icon without restoring and still restores on a click", async () => {
    render(BattleBroadcastWindow, {
      props: {
        entries,
        turnCount: 1,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "最小化战斗播报" }));
    const icon = screen.getByRole("button", { name: "恢复战斗播报" });

    await fireEvent.pointerDown(icon, {
      pointerId: 4,
      clientX: 100,
      clientY: 100,
    });
    await fireEvent.pointerMove(window, {
      pointerId: 4,
      clientX: 140,
      clientY: 130,
    });
    await fireEvent.pointerUp(window, { pointerId: 4 });

    expect(icon).toHaveStyle({ left: "64px", top: "54px" });

    // The click synthesized after a drag must not restore the full window.
    await fireEvent.click(icon);
    expect(screen.getByRole("button", { name: "恢复战斗播报" })).toBeInTheDocument();

    // Movement below the threshold keeps the original click-to-restore behavior.
    await fireEvent.pointerDown(icon, {
      pointerId: 5,
      clientX: 200,
      clientY: 200,
    });
    await fireEvent.pointerMove(window, {
      pointerId: 5,
      clientX: 203,
      clientY: 202,
    });
    await fireEvent.pointerUp(window, { pointerId: 5 });
    await fireEvent.click(icon);

    expect(screen.getByRole("complementary", { name: "战斗播报" })).toBeInTheDocument();
  });

  it("resizes within viewport bounds", async () => {
    render(BattleBroadcastWindow, {
      props: {
        entries,
        turnCount: 1,
      },
    });

    const windowElement = screen.getByRole("complementary", {
      name: "战斗播报",
    });
    const resize = screen.getByRole("button", {
      name: "调整战斗播报窗口尺寸",
    });

    await fireEvent.pointerDown(resize, {
      pointerId: 3,
      clientX: 400,
      clientY: 320,
    });
    await fireEvent.pointerMove(resize, {
      pointerId: 3,
      clientX: -9999,
      clientY: -9999,
    });
    await fireEvent.pointerUp(resize, { pointerId: 3 });

    expect(windowElement).toHaveStyle({ width: "280px", height: "180px" });
  });
  it("uses theme surface tokens instead of a fixed dark palette", () => {
    expect(battleBroadcastSource).toContain("var(--mg-bg-card");
    expect(battleBroadcastSource).toContain("var(--mg-border-light");
    expect(battleBroadcastSource).not.toContain("rgba(24, 18, 38");
  });

  it("keeps Boss mechanic history in the compact broadcast", () => {
    const mechanicEntries: BattleLogEntry[] = [
      "天地交灼",
      "寒霜棱晶开始蓄能",
      "回声档案已公开",
      "部件完整度变化",
      "终景倒计时启动",
    ].map((summary, index) => ({
      id: `mechanic-${index}`,
      sequence: index + 1,
      turnCount: index + 1,
      side: "system",
      kind: "mechanic",
      visibility: "both",
      summary,
    }));

    render(BattleBroadcastWindow, {
      props: { entries: mechanicEntries, turnCount: 5 },
    });

    for (const entry of mechanicEntries) {
      expect(screen.getByText(entry.summary)).toBeInTheDocument();
    }
  });

});

