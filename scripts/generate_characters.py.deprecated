#!/usr/bin/env python3
"""Generate characters.jsonl from skills.jsonl with skill tree assignments."""

import json
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SKILLS_PATH = ROOT / "src" / "content" / "skills.jsonl"
OUT_PATH = ROOT / "src" / "content" / "characters.jsonl"

# --- Skill assignment rules per character ---
# Each rule: (id_range_start, id_range_end) or [explicit ids]
# character_id -> { name, element, growthId, innateSkills, skill_ranges }

def id_range(start, end):
    return [str(i) for i in range(start, end + 1)]

def compute_cost(skill: dict) -> int:
    """Compute money cost based on skill tier."""
    power = skill.get("power", 0)
    mp = skill.get("mpCost", 0)
    cat = skill.get("category", "")
    sid = skill["id"]

    # Passive skills
    if cat == "passive":
        # Nullify passives cost more
        if sid in [str(i) for i in range(150, 157)]:
            return 15000
        return 5000

    # Heal / support / ailment: mpCost * 100
    sid_int = int(sid) if sid.isdigit() else 0
    if sid_int >= 86 and sid_int <= 112:
        return max(mp * 100, 200)

    # Shield skills: mpCost * 100
    if sid_int >= 113 and sid_int <= 132:
        return max(mp * 100, 200)

    # Almighty skills (high-tier)
    if sid_int >= 181 and sid_int <= 185:
        return 20000

    # Exclusive skills (high-tier)
    if sid_int >= 163 and sid_int <= 180:
        if power >= 250:
            return 20000
        elif power >= 150:
            return 10000
        else:
            return 5000

    # Standard damage skills by tier
    if power <= 80 and mp <= 5:
        return 200
    elif power <= 120 and mp <= 12:
        return 800
    elif power <= 200 and mp <= 30:
        return 3000
    else:
        return 10000


def compute_level(skill: dict) -> int:
    """Compute required level based on skill ID range."""
    sid = skill["id"]
    sid_int = int(sid) if sid.isdigit() else 1
    cat = skill.get("category", "")

    if cat == "passive":
        if sid_int <= 138:
            return 10
        elif sid_int <= 149:
            return 12
        elif sid_int <= 156:
            return 14
        else:
            return 16

    # Basic physical
    if sid_int <= 36:
        return 1

    # Elemental magic: scale within each element group
    if sid_int >= 37 and sid_int <= 85:
        group_start = ((sid_int - 37) // 7) * 7 + 37
        offset = sid_int - group_start
        return 3 + offset * 2  # Lv3, Lv5, Lv7, Lv9, Lv11, Lv13, Lv15

    # Heal
    if sid_int >= 86 and sid_int <= 91:
        return [5, 5, 8, 8, 12, 12][sid_int - 86]

    # Revive
    if sid_int >= 92 and sid_int <= 93:
        return [10, 15][sid_int - 92]

    # Support (buff/debuff/charge/chant)
    if sid_int >= 94 and sid_int <= 103:
        base = [5, 5, 5, 8, 8, 8, 10, 10, 12, 8][sid_int - 94]
        return base

    # Ailment
    if sid_int >= 104 and sid_int <= 112:
        return [5, 8, 12, 5, 8, 5, 8, 5, 10][sid_int - 104]

    # Shield
    if sid_int >= 113 and sid_int <= 132:
        base_level = 8 + (sid_int - 113) // 2
        return min(base_level, 20)

    # High-tier fire (163-164)
    if sid_int >= 163 and sid_int <= 164:
        return [15, 18][sid_int - 163]

    # Exclusive (165-180)
    if sid_int >= 165 and sid_int <= 180:
        return 15 + ((sid_int - 165) % 4) * 3

    # Almighty (181-185)
    if sid_int >= 181 and sid_int <= 185:
        return 20 + (sid_int - 181) * 3

    # Advanced support (186-189)
    if sid_int >= 186 and sid_int <= 189:
        return 15 + (sid_int - 186) * 2

    # Advanced ailment (190-191)
    if sid_int >= 190 and sid_int <= 191:
        return [12, 16][sid_int - 190]

    return 1


def compute_prerequisites(skill_id: str, skills_map: dict, assigned_ids: set) -> list[str]:
    """Compute prerequisite skill IDs within the same element group."""
    if skill_id == "attack":
        return []

    skill = skills_map.get(skill_id)
    if not skill:
        return []

    sid = int(skill_id) if skill_id.isdigit() else 0
    cat = skill.get("category", "")
    element = skill.get("element", "")
    target = skill.get("targetType", "")

    prereqs = []

    # All-target versions require single-target version
    if target.startswith("all_"):
        single_target = target.replace("all_", "single_")
        for other_id in sorted(assigned_ids, key=lambda x: int(x) if x.isdigit() else 0):
            other = skills_map.get(other_id)
            if not other:
                continue
            if (other.get("targetType") == single_target
                and other.get("element") == element
                and other.get("category") == cat
                and int(other_id) < sid):
                prereqs.append(other_id)
                break

    # Higher-tier skills in same element require the previous tier
    if sid >= 37 and sid <= 85:
        # Each element group is 7 skills
        group_start = ((sid - 37) // 7) * 7 + 37
        offset = sid - group_start
        if offset > 0:
            prev_id = str(group_start + offset - 1)
            if prev_id in assigned_ids:
                prereqs.append(prev_id)

    # Heal: medium requires small, large requires medium
    if sid in [87, 88, 90, 91]:
        prev = str(sid - 1)
        if prev in assigned_ids:
            prereqs.append(prev)
    # All heal requires single heal
    if sid == 89:
        if "86" in assigned_ids:
            prereqs.append("86")
    if sid == 90:
        if "87" in assigned_ids:
            prereqs.append("87")
    if sid == 91:
        if "88" in assigned_ids:
            prereqs.append("88")

    # Revive: greater requires lesser
    if sid == 93:
        if "92" in assigned_ids:
            prereqs.append("92")

    # Ailment all-target requires single-target
    if sid in [105, 108, 110]:
        prev = str(sid - 1)
        if prev in assigned_ids:
            prereqs.append(prev)

    return prereqs


# --- Character definitions ---

CHARACTERS = {
    "protagonist": {
        "name": "主角",
        "element": "None",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(1, 164),        # All standard skills
            [178, 179],              # Selected exclusives
            id_range(181, 185),      # Almighty
            id_range(186, 191),      # Advanced support/ailment
            id_range(133, 162),      # All passives
        ],
    },
    "kunitue_tsubame": {
        "name": "国津燕",
        "element": "Wind",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(19, 28),        # 弓系
            id_range(51, 57),        # 风系魔法
            [94, 95, 96, 100, 101, 102, 103],  # 辅助
            id_range(86, 91),        # 回复
            [133, 134, 140, 159, 160, 161, 162],  # 被动
            [169, 170],              # 专属: 风之舞步, 千风刃
        ],
    },
    "sakakibara_rune": {
        "name": "榊原琉音",
        "element": "Dark",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(1, 8),          # 剑系基础
            id_range(79, 85),        # 暗系魔法
            id_range(104, 110),      # 异常
            [97, 98, 99],            # 弱化辅助
            [111, 112],              # 防护
            [133, 134, 146, 157, 158, 159, 160, 161, 162],  # 被动
            [176, 177, 180],         # 专属: 地狱凝视, 黑洞, 吸血
        ],
    },
    "sakakibara_chinatsu": {
        "name": "榊原千夏",
        "element": "Light",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(1, 7),          # 剑系基础
            id_range(72, 78),        # 光系魔法
            id_range(86, 93),        # 回复+复苏
            [94, 95, 96, 100, 101, 102, 103],  # 辅助
            [133, 134, 145, 159, 160, 161, 162],  # 被动
            [172, 173, 174],         # 专属: 激昂心灵, 升天, 炽天使之诗
        ],
    },
    "shiota_sumireko": {
        "name": "盐田堇子",
        "element": "Electric",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(29, 36),        # 枪系
            id_range(58, 64),        # 雷系魔法
            [94, 95, 96, 100, 101, 102],  # 辅助
            id_range(86, 91),        # 回复
            [133, 134, 142, 159, 160, 161, 162],  # 被动
            [171, 175],              # 专属: 永恒之枪, 妙见神轮
        ],
    },
    "nagae_suzuna": {
        "name": "永江铃奈",
        "element": "Ice",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(44, 50),        # 冰系魔法
            id_range(86, 93),        # 回复+复苏
            id_range(94, 102),       # 辅助(除大往生外)
            [133, 134, 139, 159, 160, 161, 162],  # 被动
            [166, 167, 168],         # 专属: 寒冰牢狱, 深海的呼唤, 生命之源泉
        ],
    },
    "sakura_mao": {
        "name": "佐仓真央",
        "element": "Fire",
        "growthId": "player",
        "innateSkills": ["attack"],
        "skill_ranges": [
            id_range(1, 18),         # 剑系全量
            id_range(37, 43),        # 火系魔法
            [94, 95, 96, 97, 100, 101, 102],  # 辅助
            [111, 112],              # 防护
            [163, 164],              # 火系高级
            [133, 134, 135, 136, 137, 138, 159, 160, 161, 162],  # 被动
            [163, 164, 165],         # 专属: 烛光一闪, 日珥, 烈焰魔剑
        ],
    },
}


def main():
    # Load all skills
    skills = {}
    with open(SKILLS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            skill = json.loads(line)
            skills[skill["id"]] = skill

    print(f"Loaded {len(skills)} skills")

    characters = []
    for char_id, char_def in CHARACTERS.items():
        # Collect all assigned skill IDs
        assigned = set()
        for r in char_def["skill_ranges"]:
            for sid in r:
                assigned.add(str(sid))

        # Keep only skills that actually exist
        assigned &= set(skills.keys())

        # Build skill tree
        skill_tree = []
        for sid in sorted(assigned, key=lambda x: int(x) if x.isdigit() else 0):
            skill = skills[sid]
            cost = compute_cost(skill)
            level = compute_level(skill)
            prereqs = compute_prerequisites(sid, skills, assigned)

            skill_tree.append({
                "skillId": sid,
                "requiredLevel": level,
                "prerequisites": prereqs,
                "cost": cost,
            })

        characters.append({
            "id": char_id,
            "name": char_def["name"],
            "element": char_def["element"],
            "growthId": char_def["growthId"],
            "innateSkills": char_def["innateSkills"],
            "skillTree": skill_tree,
        })

        print(f"  {char_def['name']}: {len(skill_tree)} skills")

    # Write output
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        for char in characters:
            f.write(json.dumps(char, ensure_ascii=False) + "\n")

    print(f"\nWritten {len(characters)} characters to {OUT_PATH}")


if __name__ == "__main__":
    main()
