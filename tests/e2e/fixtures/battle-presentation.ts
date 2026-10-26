import { nextTick, toRaw } from "vue";
import { battle } from "./battle-hud";
import { createBattleEffectsRenderer, loadEffectTextures } from "@/ui/battle/battleEffectsRenderer";
import { BATTLE_ELEMENTS, type BattleActionTrace } from "@/types/battle";
import type { BattleEffectsMode } from "@/composables/useBattleEffects";

await nextTick();
const root = document.querySelector<HTMLElement>("#battle-overlay")!;
const host = document.createElement("div");
host.className = "battle-effects-layer";
host.setAttribute("aria-hidden", "true");
root.append(host);
const renderer = createBattleEffectsRenderer(host, root);
const toolbar = document.createElement("div");
toolbar.style.cssText = "position:fixed;z-index:100;left:8px;right:8px;top:8px;display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:#171722;color:#fff;border:1px solid currentColor;border-radius:10px";
root.style.paddingTop = "130px";
root.append(toolbar);
let mode: BattleEffectsMode = "standard";
const select = document.createElement("select");
select.setAttribute("aria-label", "演出模式");
for (const [value, label] of [["standard", "标准"], ["reduced", "精简"], ["off", "关闭"]]) {
  const option = document.createElement("option"); option.value = value!; option.textContent = label!; select.append(option);
}
select.onchange = () => { mode = select.value as BattleEffectsMode; if (mode === "off") renderer.cancel(); };
toolbar.append(select);
const cue = document.createElement("div");
cue.className = "battle-presentation-cue";
cue.style.cssText = "flex-basis:100%;min-height:2em;color:inherit";
cue.setAttribute("role", "status");
let busy = false;
const enemyId = battle.activeBattle!.participants.find(p => p.side === "enemy")!.id;
const base = { actorId: "ally-0", actionId: "basic-skill", name: "魔法演出", outcomes: [] } satisfies BattleActionTrace;
for (const [label, family, hits] of [["斩击", "physical", 1], ["魔弹", "magic", 1], ["群体爆发", "area", 1], ["三连击", "physical", 3], ["十五连击", "physical", 15], ["治疗", "heal", 1], ["护盾", "support", 1], ["未命中", "miss", 1], ["反射", "reflect", 1]] as const) {
  const button = document.createElement("button"); button.textContent = label; button.type = "button";
  button.onclick = async () => {
    if (busy) return;
    busy = true;
    const target = family === "heal" || family === "support" ? "ally-0" : enemyId;
    const action: BattleActionTrace = {
      ...base, name: label, category: family === "area" ? "magic" : family === "miss" || family === "reflect" ? "physical" : family,
      targetType: family === "area" ? "all_enemies" : "single_enemy", element: BATTLE_ELEMENTS.Dark,
      outcomes: Array.from({ length: hits }, () => ({ type: family === "miss" ? "miss" : family === "reflect" ? "reflect" : "hit", tags: [], actorId: "ally-0", primaryTargetId: target, finalTargetId: target,
        ...(family === "heal" ? { hpDelta: 25 } : family === "support" ? { appliedStatusEffects: [{ effectId: "guard", duration: 1 }] } : family !== "miss" && family !== "reflect" ? { hpDelta: -25 } : {}),
      })),
    };
    if (family === "reflect") action.outcomes.push({ type: "reflect", tags: [], actorId: "ally-0", primaryTargetId: enemyId, finalTargetId: "ally-0", hpDelta: -75 });
    cue.textContent = `鹿目真昼 · ${label}`;
    await renderer.play({ action, before: structuredClone(toRaw(battle.activeBattle!)), mode,
      feedback: text => { cue.textContent = `${label} · ${text}`; }, reveal: () => { cue.textContent += " · 演出完成"; },
    });
    busy = false;
  };
  toolbar.append(button);
}
const skip = document.createElement("button"); skip.textContent = "跳过"; skip.onclick = renderer.cancel; toolbar.append(skip, cue);
await loadEffectTextures();
cue.textContent = "纹理已就绪 · 选择一种演出";
