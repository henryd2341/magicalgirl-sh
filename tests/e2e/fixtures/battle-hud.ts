import { createApp } from "vue";
import { createPinia } from "pinia";
import BattleOverlay from "@/ui/battle/BattleOverlay.vue";
import { useBattleStore } from "@/stores/battleStore";
import { getStatusEffectMap } from "@/content/contentRegistry";
import "@/styles/index.scss";
import "@/styles/tailwind.css";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "e-girl";
// This standalone fixture never initializes persistence, providers or the game session.
localStorage.setItem(
  "magicalgirl:battle-broadcast:v1",
  JSON.stringify({
    version: 1,
    x: 24,
    y: 24,
    width: 380,
    height: 320,
    minimized: true,
    density: "compact",
  }),
);
const pinia = createPinia();
const battle = useBattleStore(pinia);
battle.stagePendingEncounter({
  encounterId: "hud-layout-fixture",
  narrativeReason: "HUD fixture",
  source: "story",
  enemies: [{ enemy_id: "1", count: 1 }],
});
battle.startBattle(
  ["鹿目真昼", "国津燕", "榊原琉音", "盐田堇子"].map((name, i) => ({
    id: `ally-${i}`,
    characterId: i ? name : "__player__",
    side: "player" as const,
    displayName: name,
    hp: { current: 120 - i * 15, max: 120 },
    mp: { current: 48, max: 60 },
    level: 10,
    attack: 20,
    defense: 10,
    agility: 10,
    intelligence: 20,
    isDown: false,
    isActive: true,
    canAct: true,
    availableSkillIds: new Set(["36", "37", "38", "39", "40", "41", "42", "43"]),
    statusEffects:
      i === 0
        ? [...getStatusEffectMap().keys()]
            .slice(0, Number(params.get("effects") ?? 5))
            .map(effectId => ({ effectId, remainingDuration: 3, stacks: 1 }))
        : [],
  })),
);
const enemy = battle.activeBattle!.participants.find(p => p.side === "enemy")!;
enemy.hp = { current: 5000, max: 5000 };
enemy.statusEffects = [
  { effectId: "fire_reflect", remainingDuration: 3, stacks: 1 },
  { effectId: "poison", remainingDuration: 3, stacks: 1 },
];
battle.setBattleItems({ "1": 3, "11": 1 });
battle.rebuildActionMenuForActor("ally-0");
Object.assign(window, { hudBattle: battle, hudEffects: getStatusEffectMap() });
createApp(BattleOverlay).use(pinia).mount("#app");
