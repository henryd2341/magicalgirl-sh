import { summarizeItemEffects } from "@/utils/itemEffectSummary";
import type { ItemContent } from "@/types/content";
import { describe, expect, it } from "vitest";

function makeConsumable(overrides: Partial<ItemContent> = {}): ItemContent {
  return {
    id: "test",
    name: "测试道具",
    description: "测试用",
    type: "consumable",
    tier: "common",
    price: 10,
    ...overrides,
  };
}

function makeAccessory(overrides: Partial<ItemContent> = {}): ItemContent {
  return {
    id: "test-acc",
    name: "测试饰品",
    description: "测试用",
    type: "accessory",
    tier: "common",
    price: 100,
    ...overrides,
  };
}

describe("summarizeItemEffects", () => {
  describe("consumable items", () => {
    it("summarizes HP heal", () => {
      const effects = summarizeItemEffects(makeConsumable({ healHp: 50 }));
      expect(effects).toContain("回复 50 HP");
    });

    it("summarizes full HP restore (9999 sentinel)", () => {
      const effects = summarizeItemEffects(makeConsumable({ healHp: 9999 }));
      expect(effects).toContain("回复全部 HP");
    });

    it("summarizes MP heal", () => {
      const effects = summarizeItemEffects(makeConsumable({ healMp: 30 }));
      expect(effects).toContain("回复 30 MP");
    });

    it("summarizes full MP restore (9999 sentinel)", () => {
      const effects = summarizeItemEffects(makeConsumable({ healMp: 9999 }));
      expect(effects).toContain("回复全部 MP");
    });

    it("summarizes both HP and MP heal", () => {
      const effects = summarizeItemEffects(
        makeConsumable({ healHp: 50, healMp: 30 }),
      );
      expect(effects).toContain("回复 50 HP");
      expect(effects).toContain("回复 30 MP");
    });

    it("summarizes revive", () => {
      const effects = summarizeItemEffects(
        makeConsumable({ revivePercent: 50 }),
      );
      expect(effects).toContain("复活并回复 50% HP");
    });

    it("summarizes cure status", () => {
      const effects = summarizeItemEffects(
        makeConsumable({ removeStatus: ["poison", "sleep"] }),
      );
      expect(effects.length).toBe(1);
      expect(effects[0]).toMatch(/^解除 .+/);
    });

    it("summarizes damage without element as physical", () => {
      const effects = summarizeItemEffects(
        makeConsumable({ damageFixed: 60 }),
      );
      expect(effects).toContain("物理属性伤害 60");
    });

    it("summarizes damage with element", () => {
      const effects = summarizeItemEffects(
        makeConsumable({ damageFixed: 30, element: "Fire" }),
      );
      expect(effects).toContain("火属性伤害 30");
    });

    it("summarizes buff effects with duration", () => {
      const effects = summarizeItemEffects(
        makeConsumable({
          statusEffects: [{ effectId: "attack_up", chance: 100 }],
        }),
      );
      expect(effects.length).toBe(1);
      expect(effects[0]).toMatch(/攻击力.*3回合/);
    });

    it("summarizes debuff effects with duration", () => {
      const effects = summarizeItemEffects(
        makeConsumable({
          statusEffects: [{ effectId: "attack_down", chance: 100 }],
        }),
      );
      expect(effects.length).toBe(1);
      expect(effects[0]).toMatch(/攻击力.*3回合/);
    });

    it("summarizes multiple buff effects", () => {
      const effects = summarizeItemEffects(
        makeConsumable({
          statusEffects: [
            { effectId: "attack_up", chance: 100 },
            { effectId: "defense_up", chance: 100 },
            { effectId: "agility_up", chance: 100 },
            { effectId: "intelligence_up", chance: 100 },
          ],
        }),
      );
      expect(effects).toHaveLength(4);
    });
  });

  describe("accessory items", () => {
    it("summarizes single stat modifier", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ modifiers: { attack: 4 } }),
      );
      expect(effects).toContain("攻击力 +4");
    });

    it("summarizes multiple stat modifiers", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ modifiers: { attack: 2, defense: 2 } }),
      );
      expect(effects).toContain("攻击力 +2");
      expect(effects).toContain("防御力 +2");
    });

    it("summarizes all four stat modifiers", () => {
      const effects = summarizeItemEffects(
        makeAccessory({
          modifiers: { attack: 1, defense: 1, agility: 1, intelligence: 1 },
        }),
      );
      expect(effects).toContain("攻击力 +1");
      expect(effects).toContain("防御力 +1");
      expect(effects).toContain("敏捷 +1");
      expect(effects).toContain("魔力 +1");
    });

    it("summarizes auto_buff_start effect", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ accessoryEffects: ["auto_buff_start"] }),
      );
      expect(effects).toContain(
        "战斗开始时自动获得攻击力·防御力·敏捷提升（3回合）",
      );
    });

    it("summarizes no_press_penalty effect", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ accessoryEffects: ["no_press_penalty"] }),
      );
      expect(effects).toContain(
        "Miss/无效/反弹/吸收只消耗1个Press Turn图标",
      );
    });

    it("summarizes pass_free effect", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ accessoryEffects: ["pass_free"] }),
      );
      expect(effects).toContain("Pass行动不消耗Press Turn图标");
    });

    it("summarizes miss_consume_all effect", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ accessoryEffects: ["miss_consume_all"] }),
      );
      expect(effects).toContain(
        "敌方攻击被Miss/无效时消耗敌方全部Press Turn图标",
      );
    });

    it("summarizes affinity resist", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ affinityResist: { Fire: "resist" } }),
      );
      expect(effects).toContain("火属性耐性");
    });

    it("summarizes affinity nullify", () => {
      const effects = summarizeItemEffects(
        makeAccessory({ affinityResist: { Ice: "nullify" } }),
      );
      expect(effects).toContain("水属性无效");
    });

    it("summarizes multiple affinity resists", () => {
      const effects = summarizeItemEffects(
        makeAccessory({
          affinityResist: {
            Fire: "nullify",
            Ice: "nullify",
            Wind: "nullify",
          },
        }),
      );
      expect(effects).toContain("火属性无效");
      expect(effects).toContain("水属性无效");
      expect(effects).toContain("风属性无效");
    });

    it("summarizes combined modifiers + effects + resist", () => {
      const effects = summarizeItemEffects(
        makeAccessory({
          modifiers: { attack: 4 },
          accessoryEffects: ["auto_buff_start"],
          affinityResist: { Fire: "resist" },
        }),
      );
      expect(effects).toContain("攻击力 +4");
      expect(effects).toContain(
        "战斗开始时自动获得攻击力·防御力·敏捷提升（3回合）",
      );
      expect(effects).toContain("火属性耐性");
    });
  });

  describe("edge cases", () => {
    it("returns default message for consumable with no effects", () => {
      const effects = summarizeItemEffects(makeConsumable());
      expect(effects).toEqual(["无主动效果"]);
    });

    it("returns default message for accessory with no effects", () => {
      const effects = summarizeItemEffects(makeAccessory());
      expect(effects).toEqual(["无主动效果"]);
    });
  });
});
