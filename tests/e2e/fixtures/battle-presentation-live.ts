import { nextTick } from "vue";
import { battle, hudMounted } from "./battle-hud";
import { cloneBattlePresentationData } from "@/stores/battlePresentationData";
import { setBattleEffects, type BattleEffectsMode } from "@/composables/useBattleEffects";
import { loadEffectTextures } from "@/ui/battle/battleEffectsRenderer";
import { getSkill } from "@/content/contentRegistry";

const baseline = cloneBattlePresentationData(battle.activeBattle!);
for (const p of baseline.participants) {
  p.hp = { current: 10000, max: 10000 }; p.mp = { current: 999, max: 999 };
  p.agility = 100; p.statusEffects = [];
}
baseline.pressTurn.icons = Array.from({ length: 20 }, (_, i) => ({ id: `fixture-${i}`, state: "solid" }));
const root = () => document.querySelector<HTMLElement>("#battle-overlay")!;
const toolbar = document.createElement("div");
toolbar.className = "presentation-fixture-controls";
toolbar.style.cssText = "position:fixed;z-index:1200;left:8px;right:8px;top:8px;display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:#171722;color:#fff;border:1px solid currentColor;border-radius:10px";
document.body.append(toolbar);
const style = document.createElement("style");
style.textContent = "#battle-overlay{padding-top:130px}.presentation-fixture-controls button,.presentation-fixture-controls select{padding:3px 8px;border:1px solid currentColor;border-radius:5px;font-size:14px}";
document.head.append(style);
const select = document.createElement("select"); select.setAttribute("aria-label", "演出模式");
for (const [value, label] of [["standard", "标准"], ["reduced", "精简"], ["off", "关闭"]]) {
  const option = document.createElement("option"); option.value = value!; option.textContent = label!; select.append(option);
}
select.value = new URLSearchParams(location.search).get("vfx") ?? "standard";
setBattleEffects(select.value);
select.onchange = () => setBattleEffects(select.value);
toolbar.append(select);
const status = document.createElement("span"); status.setAttribute("role", "status"); status.textContent = "载入纹理…";

export async function launch(scenario: string) {
  if (root().querySelector(".battle-presentation-cue")) return;
  const state = cloneBattlePresentationData(baseline);
  const player = state.participants[0]!; const enemy = state.participants.find(p => p.side === "enemy")!;
  const skill = ({ slash: "1", magic: "36", area: "83", multi: "174", heal: "85", support: "130", miss: "1", reflect: "1", absorb: "1", final: "1", hidden: "88" } as Record<string, string>)[scenario] ?? "1";
  if (["area", "multi", "overflow"].includes(scenario)) state.participants.push(...Array.from({ length: scenario === "overflow" ? 7 : 2 }, (_, index) => index + 1).map(i => ({ ...cloneBattlePresentationData(state).participants.find(p => p.side === "enemy")!, id: `extra-${i}`, displayName: `影兽 ${i + 1}` })));
  if (scenario === "reflect") enemy.statusEffects = [{ effectId: "physical_reflect", remainingDuration: 2, stacks: 1 }];
  if (scenario === "absorb") { enemy.statusEffects = [{ effectId: "physical_absorb", remainingDuration: 2, stacks: 1 }]; enemy.hp.current = 5000; }
  if (scenario === "final") enemy.hp.current = 1;
  if (scenario === "heal" || scenario === "hidden") for (const p of state.participants.filter(p => p.side === "player")) p.hp.current = 5000;
  state.actionMenu = [{ id: "fixture-action", label: "执行样例", description: getSkill(skill).description, kind: "action", actionId: "basic-skill", contentId: skill }];
  state.currentActorId = player.id;
  battle.restoreBattleSnapshot({ activeBattle: state });
  // Restoration rebuilds normal menus; this fixture keeps a single genuine command.
  battle.activeBattle!.actionMenu = state.actionMenu;
  await nextTick();
  const originalRandom = Math.random;
  let first = true;
  Math.random = () => {
    if (scenario === "miss") return .999;
    if (scenario === "multi" && first) { first = false; return .999; }
    return .1;
  };
  try {
    [...root().querySelectorAll<HTMLButtonElement>(".battle-command-menu__button")].find(b => b.textContent?.trim() === "执行样例")!.click();
    if (battle.activeBattle?.selectedActionId) {
      const target = getSkill(skill).targetType === "single_ally" ? ".battle-party-slot--front .battle-party-card" : ".battle-enemy-card";
      // Existing targetability updates on Vue's next tick.
      await nextTick();
      (root().querySelector<HTMLButtonElement>(target) ?? root().querySelector<HTMLButtonElement>(".battle-party-card"))!.click();
    }
  } finally { Math.random = originalRandom; }
}
for (const [scenario, label] of [["slash", "斩击"], ["magic", "魔弹"], ["area", "群体"], ["multi", "十五连击"], ["heal", "治疗"], ["support", "护盾"], ["miss", "未命中"], ["reflect", "反射"], ["absorb", "吸收"], ["final", "最后一击"], ["hidden", "隐藏队友治疗"]]) {
  const button = document.createElement("button"); button.textContent = label!; button.dataset.scenario = scenario; button.onclick = () => { void launch(scenario!); }; toolbar.append(button);
}
const reset = document.createElement("button"); reset.textContent = "同 ID 恢复"; reset.onclick = () => battle.restoreBattleSnapshot({ activeBattle: cloneBattlePresentationData(baseline) }); toolbar.append(reset);
const skip = document.createElement("button"); skip.textContent = "跳过"; skip.onclick = () => root().querySelector<HTMLButtonElement>(".battle-presentation-cue button")?.click(); toolbar.append(skip);
toolbar.append(status);
Object.assign(window, {
  presentationFixture: {
    launch, setMode: (mode: BattleEffectsMode) => { select.value = mode; setBattleEffects(mode); },
    remount: async () => { hudMounted.value = false; await nextTick(); hudMounted.value = true; await nextTick(); },
  },
});
const ready = await loadEffectTextures(); status.textContent = ready ? "纹理就绪" : "纹理不可用 · 精简反馈";
