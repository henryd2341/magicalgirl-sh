#!/usr/bin/env python3
"""Interactive character skill tree editor.

Usage:
  python scripts/edit_skill_tree.py              # interactive mode
  python scripts/edit_skill_tree.py view <char>   # view one character
  python scripts/edit_skill_tree.py view all      # view all characters
  python scripts/edit_skill_tree.py add <char> <skillId>
  python scripts/edit_skill_tree.py remove <char> <skillId>
"""

import json
import sys
from pathlib import Path

# Fix Windows GBK encoding issue with Chinese characters
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SKILLS_PATH = ROOT / "src" / "content" / "skills.jsonl"
CHARS_PATH = ROOT / "src" / "content" / "characters.jsonl"

# ── Skill classification (mirrors battleActionCatalog.ts) ──

SKILL_CATEGORY_LABELS = {
    "物理·剑系": "物理·剑系",
    "物理·弓系": "物理·弓系",
    "物理·枪系": "物理·枪系",
    "火系魔法": "火系魔法",
    "冰系魔法": "冰系魔法",
    "风系魔法": "风系魔法",
    "雷系魔法": "雷系魔法",
    "土系魔法": "土系魔法",
    "光系魔法": "光系魔法",
    "暗系魔法": "暗系魔法",
    "回复魔法": "回复魔法",
    "辅助技能": "辅助技能",
    "异常技能": "异常技能",
    "护盾技能": "护盾技能",
    "万能魔法": "万能魔法",
    "被动技能": "被动技能",
    "专属技能": "专属技能",
}


def classify_skill(skill_id: str, cat: str) -> str | None:
    sid = int(skill_id) if skill_id.isdigit() else 0
    if sid >= 1 and sid <= 17 and cat != "passive":
        return "物理·剑系"
    if sid >= 18 and sid <= 27 and cat != "passive":
        return "物理·弓系"
    if sid >= 28 and sid <= 35 and cat != "passive":
        return "物理·枪系"
    if sid >= 36 and sid <= 42 and cat != "passive":
        return "火系魔法"
    if sid >= 43 and sid <= 49 and cat != "passive":
        return "冰系魔法"
    if sid >= 50 and sid <= 56 and cat != "passive":
        return "风系魔法"
    if sid >= 57 and sid <= 63 and cat != "passive":
        return "雷系魔法"
    if sid >= 64 and sid <= 70 and cat != "passive":
        return "土系魔法"
    if sid >= 71 and sid <= 77 and cat != "passive":
        return "光系魔法"
    if sid >= 78 and sid <= 84 and cat != "passive":
        return "暗系魔法"
    if sid >= 85 and sid <= 92 and cat != "passive":
        return "回复魔法"
    if sid >= 93 and sid <= 102 and cat != "passive":
        return "辅助技能"
    if sid >= 185 and sid <= 188 and sid != 103 and cat != "passive":
        return "辅助技能"
    if sid >= 104 and sid <= 109 or sid == 103 and cat != "passive":
        return "异常技能"
    if sid >= 189 and sid <= 191 and cat != "passive":
        return "异常技能"
    if sid >= 110 and sid <= 132 and cat != "passive":
        return "护盾技能"
    if sid >= 162 and sid <= 184 and cat != "passive":
        return "专属技能"
    if cat == "passive":
        return "被动技能"
    if sid == 0:
        return "基础"
    return "其他"


# ── Cost and level computation (mirrors generate_characters.py) ──

def compute_cost(skill: dict) -> int:
    power = skill.get("power", 0)
    mp = skill.get("mpCost", 0)
    cat = skill.get("category", "")
    sid = skill["id"]
    sid_int = int(sid) if sid.isdigit() else 0

    if cat == "passive":
        return 15000 if sid_int >= 150 and sid_int <= 156 else 5000
    if sid_int >= 86 and sid_int <= 112:
        return max(mp * 100, 200)
    if sid_int >= 113 and sid_int <= 132:
        return max(mp * 100, 200)
    if sid_int >= 181 and sid_int <= 185:
        return 20000
    if sid_int >= 163 and sid_int <= 180:
        return 20000 if power >= 250 else (10000 if power >= 150 else 5000)
    if power <= 80 and mp <= 5:
        return 200
    elif power <= 120 and mp <= 12:
        return 800
    elif power <= 200 and mp <= 30:
        return 3000
    else:
        return 10000


def compute_level(skill: dict) -> int:
    sid = skill["id"]
    sid_int = int(sid) if sid.isdigit() else 1
    cat = skill.get("category", "")

    if cat == "passive":
        if sid_int <= 138: return 10
        elif sid_int <= 149: return 12
        elif sid_int <= 156: return 14
        else: return 16
    if sid_int <= 36: return 1
    if sid_int >= 37 and sid_int <= 85:
        group_start = ((sid_int - 37) // 7) * 7 + 37
        offset = sid_int - group_start
        return 3 + offset * 2
    if sid_int >= 86 and sid_int <= 91:
        return [5, 5, 8, 8, 12, 12][sid_int - 86]
    if sid_int >= 92 and sid_int <= 93:
        return [10, 15][sid_int - 92]
    if sid_int >= 94 and sid_int <= 103:
        return [5, 5, 5, 8, 8, 8, 10, 10, 12, 8][sid_int - 94]
    if sid_int >= 104 and sid_int <= 112:
        return [5, 8, 12, 5, 8, 5, 8, 5, 10][sid_int - 104]
    if sid_int >= 113 and sid_int <= 132:
        return min(8 + (sid_int - 113) // 2, 20)
    if sid_int >= 163 and sid_int <= 164:
        return [15, 18][sid_int - 163]
    if sid_int >= 165 and sid_int <= 180:
        return 15 + ((sid_int - 165) % 4) * 3
    if sid_int >= 181 and sid_int <= 185:
        return 20 + (sid_int - 181) * 3
    if sid_int >= 186 and sid_int <= 189:
        return 15 + (sid_int - 186) * 2  # Lv15, Lv17, Lv19, Lv21
    if sid_int >= 190 and sid_int <= 191:
        return [12, 16][sid_int - 190]
    return 1


def load_skills() -> dict[str, dict]:
    skills = {}
    with open(SKILLS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            s = json.loads(line)
            skills[s["id"]] = s
    return skills


def load_characters() -> list[dict]:
    chars = []
    with open(CHARS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            chars.append(json.loads(line))
    return chars


def save_characters(chars: list[dict]) -> None:
    # Atomic write via temp file to prevent corruption from rapid CLI chaining.
    tmp_path = CHARS_PATH.with_suffix(".jsonl.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        for c in chars:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    tmp_path.replace(CHARS_PATH)


# ── Display ──

def _skill_sort_key(sid: str) -> int:
    return int(sid) if sid.isdigit() else 0


def view_character(char: dict, skills: dict[str, dict]) -> None:
    tree = sorted(char["skillTree"], key=lambda n: _skill_sort_key(n["skillId"]))

    # Group by category
    grouped: dict[str, list[dict]] = {}
    for node in tree:
        skill = skills.get(node["skillId"])
        cat_name = classify_skill(node["skillId"], skill.get("category", "") if skill else "")
        if cat_name not in grouped:
            grouped[cat_name] = []
        grouped[cat_name].append(node)

    name = char["name"]
    eid = char["id"]
    affinities = char["affinities"]
    print(f"\n{'='*60}")
    print(f"  {name} ({eid})  |  元素: {affinities}  |  {len(tree)} skills")
    print(f"{'='*60}")

    for cat_name in SKILL_CATEGORY_LABELS:
        nodes = grouped.get(cat_name, [])
        if not nodes:
            continue
        # Check if any skills from this category are missing from this character
        print(f"\n  [{cat_name}]")
        for node in nodes:
            skill = skills.get(node["skillId"])
            sname = skill["name"] if skill else "???"
            prereq_str = ",".join(node["prerequisites"]) if node["prerequisites"] else "-"
            print(f"    {node['skillId']:>4s}  Lv{node['requiredLevel']:>2d}  "
                  f"${node['cost']:>5d}  pre=[{prereq_str}]  {sname}")

    # Show unclassified
    other = grouped.get("其他", [])
    if other:
        print(f"\n  [其他]")
        for node in other:
            skill = skills.get(node["skillId"])
            sname = skill["name"] if skill else "???"
            print(f"    {node['skillId']:>4s}  Lv{node['requiredLevel']:>2d}  "
                  f"${node['cost']:>5d}  {sname}")


def view_all(characters: list[dict], skills: dict[str, dict]) -> None:
    for char in characters:
        view_character(char, skills)


def view_summary(characters: list[dict]) -> None:
    print(f"\n{'ID':<25s} {'Name':<8s} {'affinities':<8s} {'Skills':>6s}")
    print("-" * 50)
    for c in characters:
        print(f"  {c['id']:<23s} {c['name']:<8s} {c['affinities']:<8s} {len(c['skillTree']):>6d}")


# ── Insert / Delete ──

def find_character(characters: list[dict], char_id: str) -> dict | None:
    for c in characters:
        if c["id"] == char_id or c["name"] == char_id:
            return c
    return None


def compute_prerequisites(skill_id: str, skills: dict[str, dict], existing_ids: set[str]) -> list[str]:
    """Auto-compute prerequisites for a skill based on affinities tree position."""
    skill = skills.get(skill_id)
    if not skill:
        return []

    sid = int(skill_id) if skill_id.isdigit() else 0
    cat = skill.get("category", "")
    affinities = skill.get("affinities", "")
    target = skill.get("targetType", "")
    prereqs = []

    # All-target versions require single-target version
    if target.startswith("all_"):
        single_target = target.replace("all_", "single_")
        for other_id in sorted(existing_ids, key=lambda x: int(x) if x.isdigit() else 0):
            other = skills.get(other_id)
            if not other:
                continue
            if (other.get("targetType") == single_target
                and other.get("affinities") == affinities
                and other.get("category") == cat
                and int(other_id) < sid):
                prereqs.append(other_id)
                break

    # Same-affinities chain: previous tier
    if sid >= 37 and sid <= 85:
        group_start = ((sid - 37) // 7) * 7 + 37
        offset = sid - group_start
        if offset > 0:
            prev_id = str(group_start + offset - 1)
            if prev_id in existing_ids:
                prereqs.append(prev_id)

    # Heal chain
    if sid in [87, 88, 90, 91]:
        prev = str(sid - 1)
        if prev in existing_ids:
            prereqs.append(prev)
    if sid == 89 and "86" in existing_ids:
        prereqs.append("86")
    if sid == 90 and "87" in existing_ids:
        prereqs.append("87")
    if sid == 91 and "88" in existing_ids:
        prereqs.append("88")

    # Revive chain
    if sid == 93 and "92" in existing_ids:
        prereqs.append("92")

    # Ailment all-target
    if sid in [105, 108, 110]:
        prev = str(sid - 1)
        if prev in existing_ids:
            prereqs.append(prev)

    return prereqs


def fix_prerequisites(tree: list[dict], skills: dict[str, dict]) -> list[dict]:
    """Remove dangling prerequisites and recompute where needed."""
    existing_ids = {n["skillId"] for n in tree}
    for node in tree:
        # Remove prerequisites that are no longer in the tree
        node["prerequisites"] = [p for p in node["prerequisites"] if p in existing_ids]
    return tree


def add_skill(char: dict, skill_id: str, skills: dict[str, dict]) -> str:
    """Add a skill to character's tree. Returns status message."""
    skill = skills.get(skill_id)
    if not skill:
        return f"ERROR: Skill '{skill_id}' not found in skills.jsonl"

    tree = char["skillTree"]
    existing = {n["skillId"] for n in tree}

    if skill_id in existing:
        return f"Skill {skill_id} ({skill['name']}) already in {char['name']}'s tree"

    existing_ids = {n["skillId"] for n in tree}
    prereqs = compute_prerequisites(skill_id, skills, existing_ids)
    cost = compute_cost(skill)
    level = compute_level(skill)

    node = {
        "skillId": skill_id,
        "requiredLevel": level,
        "prerequisites": prereqs,
        "cost": cost,
    }

    tree.append(node)
    tree.sort(key=lambda n: _skill_sort_key(n["skillId"]))

    # Fix prerequisites for skills that should now reference this new skill
    fix_prerequisites(tree, skills)

    return f"Added {skill_id} ({skill['name']}) to {char['name']}: Lv{level} ${cost}"


def remove_skill(char: dict, skill_id: str, skills: dict[str, dict]) -> str:
    """Remove a skill from character's tree. Returns status message."""
    tree = char["skillTree"]
    skill = skills.get(skill_id)
    sname = skill["name"] if skill else skill_id

    before = len(tree)
    char["skillTree"] = [n for n in tree if n["skillId"] != skill_id]
    after = len(char["skillTree"])

    if before == after:
        return f"Skill {skill_id} not found in {char['name']}'s tree"

    # Clean up dangling prerequisites
    fix_prerequisites(char["skillTree"], skills)

    return f"Removed {skill_id} ({sname}) from {char['name']}'s tree"


# ── Edit prerequisites ──

def edit_prereqs_single(char: dict, skill_id: str, new_prereqs: list[str],
                       skills: dict[str, dict]) -> str:
    """Set prerequisites for a skill in ONE character's tree."""
    tree = char["skillTree"]
    node = next((n for n in tree if n["skillId"] == skill_id), None)
    if not node:
        return f"Skill {skill_id} not in {char['name']}'s tree"

    tree_ids = {n["skillId"] for n in tree}
    invalid = [p for p in new_prereqs if p not in tree_ids]
    if invalid:
        return f"Prerequisites not in {char['name']}'s tree: {', '.join(invalid)}"

    old = node["prerequisites"]
    node["prerequisites"] = list(new_prereqs)

    skill = skills.get(skill_id)
    sname = skill["name"] if skill else skill_id
    old_str = ",".join(old) if old else "(none)"
    new_str = ",".join(new_prereqs) if new_prereqs else "(none)"
    return f"{char['name']} {skill_id} ({sname}): [{old_str}] -> [{new_str}]"


def edit_prereqs_all(characters: list[dict], skill_id: str, new_prereqs: list[str],
                      skills: dict[str, dict]) -> list[str]:
    """Set prerequisites for a skill in ALL characters that have it."""
    results = []
    for char in characters:
        if any(n["skillId"] == skill_id for n in char["skillTree"]):
            tree_ids = {n["skillId"] for n in char["skillTree"]}
            valid = [p for p in new_prereqs if p in tree_ids]
            result = edit_prereqs_single(char, skill_id, valid, skills)
            results.append(result)
    if not results:
        return [f"Skill {skill_id} not found in any character's tree"]
    return results


# ── Edit cost ──

def edit_cost_single(char: dict, skill_id: str, new_cost: int, skills: dict[str, dict]) -> str:
    """Set cost for a skill in ONE character's tree."""
    tree = char["skillTree"]
    node = next((n for n in tree if n["skillId"] == skill_id), None)
    if not node:
        return f"Skill {skill_id} not in {char['name']}'s tree"
    old = node["cost"]
    node["cost"] = new_cost
    skill = skills.get(skill_id)
    sname = skill["name"] if skill else skill_id
    return f"{char['name']} {skill_id} ({sname}): ${old} -> ${new_cost}"


def edit_cost_all(characters: list[dict], skill_id: str, new_cost: int,
                   skills: dict[str, dict]) -> list[str]:
    """Set cost for a skill in ALL characters that have it."""
    results = []
    for char in characters:
        if any(n["skillId"] == skill_id for n in char["skillTree"]):
            result = edit_cost_single(char, skill_id, new_cost, skills)
            results.append(result)
    if not results:
        return [f"Skill {skill_id} not found in any character's tree"]
    return results


# ── Interactive mode ──

def interactive_menu(characters: list[dict], skills: dict[str, dict]) -> None:
    while True:
        print("\n" + "=" * 50)
        print("  Skill Tree Editor")
        print("=" * 50)
        print("  1) View summary (all characters)")
        print("  2) View character tree")
        print("  3) Add skill to character")
        print("  4) Remove skill from character")
        print("  5) Edit prerequisites")
        print("  6) Edit cost")
        print("  7) Save & exit")
        print("  8) Exit without saving")
        choice = input("\n  Choice [1-8]: ").strip()

        if choice == "1":
            view_summary(characters)

        elif choice == "2":
            print("\n  Characters:")
            for i, c in enumerate(characters):
                print(f"    {i+1}) {c['name']} ({c['id']}) [{len(c['skillTree'])} skills]")
            sel = input("  Enter name/id or number: ").strip()
            char = None
            if sel.isdigit():
                idx = int(sel) - 1
                if 0 <= idx < len(characters):
                    char = characters[idx]
            else:
                char = find_character(characters, sel)
            if char:
                view_character(char, skills)
            else:
                print("  Character not found.")

        elif choice == "3":
            char = _prompt_character(characters)
            if not char:
                continue
            sid = input("  Skill ID to add: ").strip()
            # Show the skill info
            skill = skills.get(sid)
            if not skill:
                print(f"  ERROR: Skill '{sid}' not in skills.jsonl")
                continue
            print(f"  Skill: {sid} ({skill['name']}) — {skill.get('category','')} "
                  f"{skill.get('affinities','')} power={skill.get('power',0)} mp={skill.get('mpCost',0)}")
            confirm = input(f"  Add to {char['name']}? [Y/n]: ").strip().lower()
            if confirm in ("", "y", "yes"):
                result = add_skill(char, sid, skills)
                print(f"  {result}")
            else:
                print("  Cancelled.")

        elif choice == "4":
            char = _prompt_character(characters)
            if not char:
                continue
            view_character(char, skills)
            sid = input("  Skill ID to remove: ").strip()
            confirm = input(f"  Remove {sid} from {char['name']}? [Y/n]: ").strip().lower()
            if confirm in ("", "y", "yes"):
                result = remove_skill(char, sid, skills)
                print(f"  {result}")
            else:
                print("  Cancelled.")

        elif choice == "5":
            char = _prompt_character(characters)
            if not char:
                continue
            view_character(char, skills)
            sid = input("  Skill ID to edit prereqs: ").strip()
            node = next((n for n in char["skillTree"] if n["skillId"] == sid), None)
            if not node:
                print(f"  Skill {sid} not in {char['name']}'s tree")
                continue
            skill = skills.get(sid)
            sname = skill["name"] if skill else sid
            old_str = ",".join(node["prerequisites"]) if node["prerequisites"] else "(none)"
            print(f"  {sid} ({sname}) current prereqs: [{old_str}]")
            print(f"  Enter new prereq IDs (comma-separated, empty to clear):")
            raw = input("  > ").strip()
            new_prereqs = [p.strip() for p in raw.split(",") if p.strip()]

            print(f"  New prereqs: [{','.join(new_prereqs) if new_prereqs else '(none)'}]")
            scope = input(f"  Apply to (t)his character only, or (a)ll characters? [T/a]: ").strip().lower()
            confirm = input("  Confirm? [Y/n]: ").strip().lower()
            if confirm not in ("", "y", "yes"):
                print("  Cancelled.")
                continue
            if scope == "a":
                results = edit_prereqs_all(characters, sid, new_prereqs, skills)
                for r in results:
                    print(f"  {r}")
            else:
                result = edit_prereqs_single(char, sid, new_prereqs, skills)
                print(f"  {result}")
        elif choice == "6":
            char = _prompt_character(characters)
            if not char:
                continue
            view_character(char, skills)
            sid = input("  Skill ID to edit cost: ").strip()
            node = next((n for n in char["skillTree"] if n["skillId"] == sid), None)
            if not node:
                print(f"  Skill {sid} not in {char['name']}'s tree")
                continue
            skill = skills.get(sid)
            sname = skill["name"] if skill else sid
            print(f"  {sid} ({sname}) current cost: ${node['cost']}")
            raw = input("  New cost: ").strip()
            if not raw.isdigit():
                print("  Invalid number.")
                continue
            new_cost = int(raw)
            scope = input("  Apply to (t)his character only, or (a)ll characters? [T/a]: ").strip().lower()
            confirm = input(f"  Set {sid} cost to ${new_cost}? [Y/n]: ").strip().lower()
            if confirm not in ("", "y", "yes"):
                print("  Cancelled.")
                continue
            if scope == "a":
                results = edit_cost_all(characters, sid, new_cost, skills)
                for r in results:
                    print(f"  {r}")
            else:
                result = edit_cost_single(char, sid, new_cost, skills)
                print(f"  {result}")

        elif choice == "7":
            save_characters(characters)
            print(f"  Saved to {CHARS_PATH}")
            break

        elif choice == "8":
            print("  Exiting without saving.")
            break

        else:
            print("  Invalid choice.")


def _prompt_character(characters: list[dict]) -> dict | None:
    print("\n  Characters:")
    for i, c in enumerate(characters):
        print(f"    {i+1}) {c['name']} ({c['id']}) [{len(c['skillTree'])} skills]")
    sel = input("  Enter name/id or number: ").strip()
    if sel.isdigit():
        idx = int(sel) - 1
        if 0 <= idx < len(characters):
            return characters[idx]
    else:
        return find_character(characters, sel)
    return None


# ── CLI ──

def validate_skill_trees(characters: list[dict]) -> None:
    """Check prerequisites across all characters for missing refs and simple cycles."""
    issues = 0
    for char in characters:
        tree = char.get("skillTree", [])
        skill_ids = {node["skillId"] for node in tree}

        for node in tree:
            sid = node["skillId"]
            for prereq in node.get("prerequisites", []):
                if prereq not in skill_ids:
                    print(f"[{char['id']}] skill {sid}: prerequisite {prereq} not in tree")
                    issues += 1

        # Simple cycle check: A -> B and B -> A
        adj: dict[str, set[str]] = {}
        for node in tree:
            adj[node["skillId"]] = set(node.get("prerequisites", []))
        for a, deps in adj.items():
            for b in deps:
                if b in adj and a in adj[b] and a < b:
                    print(f"[{char['id']}] cycle: {a} <-> {b}")
                    issues += 1

    if issues == 0:
        print("All skill trees valid. No issues found.")
    else:
        print(f"\n{issues} issue(s) found.")

def main() -> None:
    skills = load_skills()
    characters = load_characters()

    if len(sys.argv) < 2:
        interactive_menu(characters, skills)
        return

    cmd = sys.argv[1]

    if cmd == "view":
        target = sys.argv[2] if len(sys.argv) > 2 else "all"
        if target == "all":
            view_all(characters, skills)
        else:
            char = find_character(characters, target)
            if char:
                view_character(char, skills)
            else:
                print(f"Character not found: {target}")
                view_summary(characters)

    elif cmd == "add":
        if len(sys.argv) < 4:
            print("Usage: python edit_skill_tree.py add <char> <skillId>")
            sys.exit(1)
        char = find_character(characters, sys.argv[2])
        if not char:
            print(f"Character not found: {sys.argv[2]}")
            view_summary(characters)
            sys.exit(1)
        result = add_skill(char, sys.argv[3], skills)
        print(result)
        save_characters(characters)

    elif cmd == "remove":
        if len(sys.argv) < 4:
            print("Usage: python edit_skill_tree.py remove <char> <skillId>")
            sys.exit(1)
        char = find_character(characters, sys.argv[2])
        if not char:
            print(f"Character not found: {sys.argv[2]}")
            view_summary(characters)
            sys.exit(1)
        result = remove_skill(char, sys.argv[3], skills)
        print(result)
        save_characters(characters)

    elif cmd == "summary":
        view_summary(characters)

    elif cmd == "prereq":
        # Usage: python edit_skill_tree.py prereq <char|all> <skillId> [<prereq1,prereq2,...>]
        if len(sys.argv) < 4:
            print("Usage: python edit_skill_tree.py prereq <char|all> <skillId> [prereq1,prereq2,...]")
            sys.exit(1)
        target = sys.argv[2]
        sid = sys.argv[3]
        new_prereqs = sys.argv[4].split(",") if len(sys.argv) > 4 else []
        new_prereqs = [p.strip() for p in new_prereqs if p.strip()]
        if target == "all":
            results = edit_prereqs_all(characters, sid, new_prereqs, skills)
            for r in results:
                print(r)
        else:
            char = find_character(characters, target)
            if not char:
                print(f"Character not found: {target}")
                sys.exit(1)
            print(edit_prereqs_single(char, sid, new_prereqs, skills))
        save_characters(characters)

    elif cmd == "cost":
        if len(sys.argv) < 4:
            print("Usage: python edit_skill_tree.py cost <char|all> <skillId> <newCost>")
            sys.exit(1)
        target = sys.argv[2]
        sid = sys.argv[3]
        if not sys.argv[4].isdigit():
            print(f"Invalid cost: {sys.argv[4]}")
            sys.exit(1)
        new_cost = int(sys.argv[4])
        if target == "all":
            results = edit_cost_all(characters, sid, new_cost, skills)
            for r in results:
                print(r)
        else:
            char = find_character(characters, target)
            if not char:
                print(f"Character not found: {target}")
                sys.exit(1)
            print(edit_cost_single(char, sid, new_cost, skills))
        save_characters(characters)

    elif cmd == "validate":
        validate_skill_trees(characters)

    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python edit_skill_tree.py [view|add|remove|summary|validate|prereq|cost] [args]")
        sys.exit(1)


if __name__ == "__main__":
    main()
