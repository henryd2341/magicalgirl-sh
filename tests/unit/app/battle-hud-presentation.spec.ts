import { fireEvent, render, screen, within } from "@testing-library/vue";
import { createPinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStatusEffectMap } from "@/content/contentRegistry";
import { MAX_BATTLE_LOG_ENTRIES } from "@/engine/battle/battleLogger";
import { useBattleStore } from "@/stores/battleStore";
import type { BattleParticipant } from "@/types/battle";
import BattlePartyCard from "@/ui/battle/BattlePartyCard.vue";
import BattleOverlay from "@/ui/battle/BattleOverlay.vue";
import { statusEffectIcon } from "@/ui/battle/statusEffectIcons";

function ally(id = "a"): BattleParticipant {
  return {
    id,
    side: "player",
    displayName: id,
    hp: { current: 100, max: 120 },
    mp: { current: 30, max: 50 },
    isDown: false,
    isActive: true,
    canAct: true,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared battle status presentation", () => {
  it("covers every bundled effect and retains a named unknown fallback", () => {
    const fallback = statusEffectIcon("unknown");
    const definitions = [...getStatusEffectMap().values()];
    expect(definitions).toHaveLength(40);
    for (const definition of definitions) expect(statusEffectIcon(definition.id)).not.toBe(fallback);
    expect(new Set(definitions.map(effect => statusEffectIcon(effect.id))).size).toBe(40);
  });

  for (const count of [0, 1, 4, 5, 8, 9]) {
    it(`preserves ${count} effects, exact names and source order outside the vital flow`, async () => {
      const player = ally();
      const definitions = [...getStatusEffectMap().values()].slice(0, count);
      player.statusEffects = definitions.map(effect => ({ effectId: effect.id, remainingDuration: 3, stacks: 1 }));
      const before = JSON.stringify(player);
      const { container } = render(BattlePartyCard, {
        props: { player, avatar: "portrait.png", acting: true, targetable: false },
      });
      const images = [...container.querySelectorAll(".battle-status-effects__grid img")];
      expect(images.map(image => image.getAttribute("alt"))).toEqual(definitions.map(effect => effect.name));
      expect(container.querySelector(".battle-party-card__body .battle-party-card__actor")).toBeNull();
      expect(container.querySelector(".battle-party-card__body .battle-status-effects")).toBeNull();
      expect(screen.queryByText("正常")).not.toBeInTheDocument();
      if (count) {
        const inspect = screen.getByRole("button", { name: "查看a的状态" });
        expect(inspect.closest(".battle-party-card")).toBeNull();
        await fireEvent.click(inspect);
        expect(screen.getByRole("dialog", { name: "a的状态" }).parentElement).toBe(document.body);
      } else expect(screen.queryByRole("button", { name: "查看a的状态" })).toBeNull();
      expect(JSON.stringify(player)).toBe(before);
    });
  }

  it("retains keyboard status names when the pointer leaves a resized effect area", async () => {
    const player = ally();
    player.statusEffects = [{ effectId: "attack_up", stacks: 1, remainingDuration: 1 }];
    const shown = vi.spyOn(HTMLElement.prototype, "showPopover");
    const hidden = vi.spyOn(HTMLElement.prototype, "hidePopover");
    render(BattlePartyCard, { props: { player, avatar: "portrait.png", acting: false, targetable: false } });
    const inspect = screen.getByRole("button", { name: "查看a的状态" });
    inspect.focus();
    await nextTick();
    expect(shown).toHaveBeenCalled();
    await fireEvent.mouseLeave(inspect);
    expect(hidden).not.toHaveBeenCalled();
  });

  it("exposes unknown names and stacked effects without activating the target", async () => {
    const player = ally();
    player.statusEffects = [{ effectId: "unregistered_effect", stacks: 2, remainingDuration: 1 }];
    const selected = vi.fn();
    render(BattlePartyCard, {
      props: { player, avatar: "portrait.png", acting: false, targetable: true, onSelect: selected },
    });
    expect(screen.getByAltText("unregistered_effect")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "查看a的状态" }));
    expect(screen.getByText("×2")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "关闭a的状态" }));
    expect(selected).not.toHaveBeenCalled();
  });
});

async function overlay() {
  const pinia = createPinia();
  const store = useBattleStore(pinia);
  store.stagePendingEncounter({
    encounterId: "hud",
    narrativeReason: "hud",
    source: "story",
    enemies: [{ enemy_id: "1", count: 1 }],
  });
  store.startBattle([ally("a"), ally("b"), ally("c"), ally("d")]);
  store.rebuildActionMenuForActor("a");
  const result = render(BattleOverlay, { global: { plugins: [pinia] } });
  await nextTick();
  return { ...result, store };
}

describe("mobile roster inspection", () => {
  it("closes after a successful target at the log cap, but not after a rejected selection", async () => {
    const { store } = await overlay();
    store.setBattleItems({ "1": 3 });
    const battle = store.activeBattle!;
    battle._targetTypeHint = "single_ally";
    battle.selectedActionId = "basic-item";
    battle.selectedContentId = "1";
    battle.battleLog = Array.from({ length: MAX_BATTLE_LOG_ENTRIES }, (_, index) => ({
      id: `log-${index}`,
      sequence: index + 1,
      turnCount: 1,
      side: "system",
      kind: "system",
      visibility: "both",
      summary: "Earlier action",
    }));
    await fireEvent.click(screen.getByRole("button", { name: "查看队伍", exact: true }));
    const modal = screen.getByRole("dialog", { name: "玩家队伍", exact: true });
    const target = modal.querySelector('[data-participant-id="b"] .battle-party-card')!;
    const rejected = vi.spyOn(store, "selectTarget").mockImplementationOnce(() => {});
    await fireEvent.click(target);
    expect(modal).toBeInTheDocument();
    rejected.mockRestore();
    await fireEvent.click(target);
    expect(screen.queryByRole("dialog", { name: "玩家队伍", exact: true })).toBeNull();
    expect(store.activeBattle!.participants[1].hp.current).toBe(120);
    expect(store.activeBattle!.battleLog).toHaveLength(MAX_BATTLE_LOG_ENTRIES);
    expect(store.activeBattle!.battleLog!.at(-1)!.sequence).toBeGreaterThan(MAX_BATTLE_LOG_ENTRIES);
  });

  it("previews only distinct eligible allies from the live queue and preserves all members", async () => {
    const { container, store } = await overlay();
    const battle = store.activeBattle!;
    battle.pressTurnAllocation!.participantIds = ["a", "c", "b", "d"];
    await nextTick();
    expect(container.querySelector(".battle-party-slot--next")?.getAttribute("data-participant-id")).toBe("c");
    battle.participants[2].canAct = false;
    battle.participants[1].isDown = true;
    battle.participants[3].isActive = false;
    await nextTick();
    expect(container.querySelector(".battle-party-slot--next")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "查看队伍", exact: true }));
    const modal = screen.getByRole("dialog", { name: "玩家队伍", exact: true });
    expect(modal.querySelectorAll(".battle-party-card")).toHaveLength(4);
    expect(within(modal).getByText("倒下")).toBeInTheDocument();
    expect(within(modal).getByText("后备")).toBeInTheDocument();
    expect(modal.querySelectorAll(".battle-party-card:not(:disabled)")).toHaveLength(0);
    await fireEvent.click(within(modal).getByRole("button", { name: "关闭玩家队伍" }));
    battle.participants[0].canAct = false;
    await nextTick();
    expect(container.querySelector(".battle-party-slot--next")).toBeNull();
  });

  it("opening and closing preserves pending actions; stale enemy-phase targeting cannot execute", async () => {
    vi.useFakeTimers();
    const { container, store } = await overlay();
    store.activeBattle!._targetTypeHint = "single_ally";
    store.activeBattle!.selectedActionId = "basic-item";
    store.activeBattle!.selectedContentId = "1";
    const select = vi.spyOn(store, "selectTarget");
    const before = JSON.stringify(store.activeBattle);
    await fireEvent.click(screen.getByRole("button", { name: "查看队伍", exact: true }));
    await fireEvent.click(screen.getByRole("button", { name: "关闭玩家队伍" }));
    expect(JSON.stringify(store.activeBattle)).toBe(before);
    expect(select).not.toHaveBeenCalled();
    store.activeBattle!.phase = "ENEMY_TURN";
    store.activeBattle!.currentActorId = store.activeBattle!.participants[4].id;
    store.activeBattle!.pressTurn.ownerSide = "enemy";
    await nextTick();
    expect(container.querySelector(".battle-party-slot--front")?.getAttribute("data-participant-id")).toBe("a");
    expect(container.querySelector(".battle-party-slot--next")).toBeNull();
    expect(container.querySelector(".battle-party-card__actor")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "查看队伍", exact: true }));
    const modal = screen.getByRole("dialog", { name: "玩家队伍", exact: true });
    expect(modal.querySelectorAll(".battle-party-card:not(:disabled)")).toHaveLength(0);
    expect(select).not.toHaveBeenCalled();
  });

  it("shares enemy status inspection and leaves downed revival targets available", async () => {
    const { store } = await overlay();
    store.activeBattle!.participants[4].statusEffects = [{ effectId: "poison", stacks: 1, remainingDuration: 1 }];
    store.activeBattle!.participants[1].isDown = true;
    store.activeBattle!.participants[1].hp.current = 0;
    store.activeBattle!._targetTypeHint = "single_ally";
    store.activeBattle!.selectedActionId = "basic-item";
    store.activeBattle!.selectedContentId = "11";
    await nextTick();
    expect(within(screen.getByLabelText("敌人区域")).getByAltText("中毒")).toBeInTheDocument();
    const inspect = within(screen.getByLabelText("敌人区域")).getByRole("button", { name: /查看.*的状态/ });
    expect(inspect).toBeEnabled();
    await fireEvent.click(screen.getByRole("button", { name: "查看队伍", exact: true }));
    const modal = screen.getByRole("dialog", { name: "玩家队伍", exact: true });
    expect(modal.querySelector('[data-participant-id="b"] .battle-party-card')).toBeEnabled();
  });
});
