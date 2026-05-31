#!/usr/bin/env python3
"""Generate 160 enemies (8 elements x 20 each) for magicalgirl-sh.

Usage: python scripts/generate_enemies.py [--dry-run]
  --dry-run  Print summary without writing files.
"""

import json, sys, os, math, random
from pathlib import Path

random.seed(42)

ROOT = Path(__file__).resolve().parent.parent
SKILLS_PATH = ROOT / "src" / "content" / "skills.jsonl"
OUT_PATH = ROOT / "src" / "content" / "enemies.jsonl"

# ── Naming tables ──

ELEMENT_PREFIXES = {
    "Physical": ["钢", "刃", "角", "牙", "棘", "铁", "烈", "蛮", "斗", "碎"],
    "Fire":     ["炎", "熔", "灼", "烬", "焚", "焰", "爆", "燐", "焦", "煅"],
    "Ice":      ["冰", "霜", "潮", "涟", "汐", "寒", "冻", "雪", "凌", "晶"],
    "Wind":     ["风", "岚", "飍", "羽", "翔", "旋", "飙", "飘", "疾", "缭"],
    "Electric": ["雷", "霆", "电", "磁", "闪", "霹", "雳", "弧", "震", "赫"],
    "Earth":    ["岩", "石", "砂", "晶", "峦", "峰", "砾", "磐", "岗", "砺"],
    "Light":    ["光", "辉", "曜", "圣", "镜", "煌", "烁", "璨", "皎", "莹"],
    "Dark":     ["暗", "影", "冥", "渊", "噬", "幽", "晦", "魇", "黯", "蚀"],
}

BEAST_TYPES = ["兽", "虫", "蜥", "蛇", "鸟", "鱼", "龟", "蛙", "隼", "马",
               "狐", "犬", "猫", "兔", "蟹", "蝎", "猿", "熊", "蛭", "蝠"]

# ── Level tiers (2 enemies per tier, 10 tiers per element) ──

def level_for_tier(tier: int, variant: int) -> int:
    """variant: 0 = basic, 1 = advanced within tier"""
    base_levels = [1, 3, 6, 10, 15, 21, 29, 39, 52, 68]
    offset = variant * random.randint(1, 2)
    return base_levels[tier] + offset

# ── Stat formulas ──

ELEMENT_STAT_MODS = {
    # (hp_mul, mp_mul, atk_mul, def_mul, agi_mul, int_mul)
    "Physical": (1.0, 0.4, 1.35, 1.2, 0.85, 0.5),
    "Fire":     (0.9, 0.8, 1.2, 0.8, 1.15, 0.95),
    "Ice":      (1.15, 0.9, 0.85, 1.15, 0.8, 1.0),
    "Wind":     (0.85, 0.7, 0.85, 0.8, 1.45, 0.9),
    "Electric": (0.9, 0.85, 0.95, 0.75, 1.2, 1.1),
    "Earth":    (1.3, 0.5, 0.9, 1.35, 0.65, 0.8),
    "Light":    (0.85, 1.1, 0.9, 0.9, 1.05, 1.15),
    "Dark":     (0.9, 1.0, 1.1, 0.85, 1.0, 1.1),
}

def compute_stats(base_level: int, element: str):
    m = ELEMENT_STAT_MODS[element]
    base_stat = base_level * 0.6 + 3
    return {
        "hp": max(8, round((base_level * 12 + 10) * m[0])),
        "mp": max(0, round(base_level * 3 * m[1])),
        "attack": max(2, round(base_stat * m[2])),
        "defense": max(2, round(base_stat * m[3])),
        "agility": max(2, round(base_stat * m[4])),
        "intelligence": max(2, round(base_stat * m[5])),
    }

# ── Affinity rules ──

ALL_ELEMENTS = ["Physical", "Fire", "Ice", "Wind", "Electric", "Earth", "Light", "Dark"]

ELEMENT_WEAKNESS = {
    "Physical": [],          # no fixed weakness
    "Fire":     ["Ice"],
    "Ice":      ["Electric"],
    "Wind":     ["Earth"],
    "Electric": ["Wind"],
    "Earth":    ["Fire"],
    "Light":    ["Dark"],
    "Dark":     ["Light"],
}

ELEMENT_RESIST = {
    "Physical": ["Physical"],
    "Fire":     ["Fire"],
    "Ice":      ["Ice"],
    "Wind":     ["Wind"],
    "Electric": ["Electric"],
    "Earth":    ["Earth"],
    "Light":    ["Light"],
    "Dark":     ["Dark"],
}

# Physical enemies get a random extra resist
PHYSICAL_EXTRA_RESIST_ELEMENTS = ["Fire", "Ice", "Wind", "Electric", "Earth"]

def make_affinities(element: str, tier: int, variant: int, seed_idx: int):
    weak = list(ELEMENT_WEAKNESS.get(element, []))
    resist = list(ELEMENT_RESIST.get(element, []))

    # Physical gets a random extra resist from the 5 basic elements
    if element == "Physical":
        extra = PHYSICAL_EXTRA_RESIST_ELEMENTS[seed_idx % len(PHYSICAL_EXTRA_RESIST_ELEMENTS)]
        if extra not in resist:
            resist.append(extra)
        # also random weakness from the remaining basic elements
        weak_candidates = [e for e in PHYSICAL_EXTRA_RESIST_ELEMENTS if e != extra]
        weak.append(weak_candidates[seed_idx % len(weak_candidates)])

    nullify = []
    reflect = []
    absorb = []

    # Higher tiers gain extra defenses
    if tier >= 6:
        candidates = [e for e in ALL_ELEMENTS if e not in weak and e not in resist and e != element]
        if candidates:
            resist.append(candidates[seed_idx % len(candidates)])
    if tier >= 8:
        # upgrade one resist to nullify or add nullify
        if resist and variant == 1:
            upgraded = resist.pop()
            nullify.append(upgraded)
        elif not nullify:
            nullify.append(element)
    if tier >= 9:
        if nullify and variant == 1 and random.random() < 0.3:
            upgraded = nullify.pop()
            reflect.append(upgraded)

    return {
        "weak": weak,
        "resist": resist,
        "nullify": nullify,
        "reflect": reflect,
        "absorb": absorb,
    }

# ── Skill assignment ──

SKILL_POOL = {
    "Physical": {
        0: ["2"],         1: ["3"],
        2: ["5", "6"],    3: ["7", "9"],
        4: ["13", "11"],  5: ["14", "15"],
        6: ["17", "18"],  7: ["27", "28", "36"],
        8: ["33", "171"], 9: ["175", "185"],
    },
    "Fire": {
        0: ["37"],        1: ["38"],
        2: ["39"],        3: ["40"],
        4: ["41"],        5: ["42"],
        6: ["43"],        7: ["163", "164"],
        8: ["165"],       9: ["178"],
    },
    "Ice": {
        0: ["44"],        1: ["45"],
        2: ["46"],        3: ["47"],
        4: ["48"],        5: ["49"],
        6: ["50"],        7: ["166", "167"],
        8: ["175"],       9: ["178"],
    },
    "Wind": {
        0: ["51"],        1: ["52"],
        2: ["53"],        3: ["54"],
        4: ["55"],        5: ["56"],
        6: ["57"],        7: ["169", "170"],
        8: ["175"],       9: ["178"],
    },
    "Electric": {
        0: ["58"],        1: ["59"],
        2: ["60"],        3: ["61"],
        4: ["62"],        5: ["63"],
        6: ["64"],        7: ["175"],
        8: ["178"],       9: ["184"],
    },
    "Earth": {
        0: ["65"],        1: ["66"],
        2: ["67"],        3: ["68"],
        4: ["69"],        5: ["70"],
        6: ["71"],        7: ["175"],
        8: ["178"],       9: ["184"],
    },
    "Light": {
        0: ["72"],        1: ["73"],
        2: ["74"],        3: ["75"],
        4: ["76"],        5: ["77"],
        6: ["78"],        7: ["173", "174"],
        8: ["175"],       9: ["178"],
    },
    "Dark": {
        0: ["79"],        1: ["80"],
        2: ["81"],        3: ["82"],
        4: ["83"],        5: ["84"],
        6: ["85"],        7: ["176", "177"],
        8: ["175"],       9: ["178"],
    },
}

# Support/debuff skills granted to higher tiers (selected enemies)
SUPPORT_SKILLS = ["94", "95", "96", "97", "98", "99", "100", "101", "102"]
AILMENT_SKILLS = ["104", "105", "106", "107", "108", "109", "110"]

def assign_skills(element: str, tier: int, variant: int, seed_idx: int):
    pool = SKILL_POOL.get(element, {}).get(tier, [])
    skills = []

    if pool:
        idx = min(variant, len(pool) - 1)
        skills.append(pool[idx])

    # Higher tiers: add support or ailment skills
    rng = random.Random(seed_idx * 100 + tier * 10 + variant)
    if tier >= 5 and variant == 1 and rng.random() < 0.5:
        skills.append(rng.choice(SUPPORT_SKILLS))
    if tier >= 6 and variant == 0 and rng.random() < 0.3:
        skills.append(rng.choice(AILMENT_SKILLS))

    return skills

# ── Reward formulas ──

def compute_rewards(base_level: int, variant: int):
    exp = base_level * 8 + 5
    money = base_level * 5 + 8
    if variant == 1:  # advanced variant bonus
        exp = round(exp * 1.3)
        money = round(money * 1.3)
    return exp, money

# ── Naming ──

def make_name(element: str, tier: int, variant: int, seed_idx: int):
    rng = random.Random(seed_idx + tier * 20)
    prefix = ELEMENT_PREFIXES[element][(tier + variant) % len(ELEMENT_PREFIXES[element])]
    creature = BEAST_TYPES[(seed_idx * 7 + tier * 3 + variant) % len(BEAST_TYPES)]
    return f"{prefix}{creature}"

# ── Generate ──

ELEMENT_ORDER = ["Physical", "Fire", "Ice", "Wind", "Electric", "Earth", "Light", "Dark"]

def generate():
    enemies = []
    idx = 0
    for element in ELEMENT_ORDER:
        for tier in range(10):
            for variant in range(2):
                idx += 1
                base_level = level_for_tier(tier, variant)
                name = make_name(element, tier, variant, idx)
                stats = compute_stats(base_level, element)
                affinities = make_affinities(element, tier, variant, idx)
                skills = assign_skills(element, tier, variant, idx)
                exp, money = compute_rewards(base_level, variant)

                enemy = {
                    "id": str(idx),
                    "name": name,
                    "baseLevel": base_level,
                    "stats": stats,
                    "affinities": affinities,
                    "skills": skills,
                    "expReward": exp,
                    "moneyReward": money,
                }
                enemies.append(enemy)

    return enemies

# ── Main ──

def main():
    dry_run = "--dry-run" in sys.argv

    enemies = generate()

    if dry_run:
        print(f"Would generate {len(enemies)} enemies.")
        print(f"\nFirst 10:")
        for e in enemies[:10]:
            print(f"  [{e['id']}] {e['name']} Lv{e['baseLevel']} "
                  f"HP:{e['stats']['hp']} ATK:{e['stats']['attack']} "
                  f"skills:{e['skills']} rewards:{e['expReward']}/{e['moneyReward']}")
        print(f"\nLast 10:")
        for e in enemies[-10:]:
            print(f"  [{e['id']}] {e['name']} Lv{e['baseLevel']} "
                  f"HP:{e['stats']['hp']} ATK:{e['stats']['attack']} "
                  f"skills:{e['skills']} affinities:{e['affinities']}")
        return

    # Write JSONL
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        for e in enemies:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    print(f"Generated {len(enemies)} enemies -> {OUT_PATH}")

    # Quick stats
    levels = [e["baseLevel"] for e in enemies]
    print(f"Level range: {min(levels)} - {max(levels)}")
    for el in ELEMENT_ORDER:
        pref_set = set(ELEMENT_PREFIXES[el])
        count = sum(1 for e in enemies if e["name"][0] in pref_set)
        lv_range = [e["baseLevel"] for e in enemies if e["name"][0] in pref_set]
        print(f"  {el}: {count} enemies, Lv{min(lv_range)}-{max(lv_range)}")

if __name__ == "__main__":
    main()
