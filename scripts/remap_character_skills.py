#!/usr/bin/env python3
"""Remap character skill tree IDs after skills.jsonl restructuring.

Reads old skills from git HEAD, builds a fingerprint map to new IDs,
then updates characters.jsonl (skipping protagonist line 1).
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS_PATH = ROOT / "src" / "content" / "skills.jsonl"
CHARS_PATH = ROOT / "src" / "content" / "characters.jsonl"


def fingerprint(skill: dict) -> tuple:
    """Build a unique-enough fingerprint for matching old<->new skills."""
    return (
        skill["name"],
        skill.get("category", ""),
        skill.get("element", ""),
        skill.get("power", 0),
        skill.get("mpCost", 0),
        skill.get("targetType", ""),
    )


def load_jsonl(path: str | Path) -> list[dict]:
    data = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data.append(json.loads(line))
    return data


def load_old_skills() -> list[dict]:
    """Load skills.jsonl from the last git commit."""
    result = subprocess.run(
        ["git", "show", "HEAD:src/content/skills.jsonl"],
        capture_output=True, cwd=ROOT,
    )
    if result.returncode != 0 or not result.stdout:
        err = result.stderr.decode("utf-8") if result.stderr else "no output"
        print(f"ERROR: git show failed: {err}")
        sys.exit(1)
    data = []
    text = result.stdout.decode("utf-8")
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        data.append(json.loads(line))
    return data


def main():
    print("Loading old skills (git HEAD)...")
    old_skills = load_old_skills()
    print(f"  {len(old_skills)} old skills")

    print("Loading current skills...")
    new_skills = load_jsonl(SKILLS_PATH)
    print(f"  {len(new_skills)} new skills")

    # Build fingerprint maps
    # old: fingerprint -> old_id
    old_fp_to_id: dict[tuple, str] = {}
    old_dupes = 0
    for sk in old_skills:
        fp = fingerprint(sk)
        if fp in old_fp_to_id:
            old_dupes += 1
            print(f"  WARN: old duplicate fp: {fp} -> ids {old_fp_to_id[fp]}, {sk['id']}")
        old_fp_to_id[fp] = sk["id"]

    # new: fingerprint -> new_id
    new_fp_to_id: dict[tuple, str] = {}
    new_dupes = 0
    for sk in new_skills:
        fp = fingerprint(sk)
        if fp in new_fp_to_id:
            new_dupes += 1
            print(f"  WARN: new duplicate fp: {fp} -> ids {new_fp_to_id[fp]}, {sk['id']}")
        new_fp_to_id[fp] = sk["id"]

    # Build old_id -> new_id mapping
    id_map: dict[str, str] = {}
    unmapped: list[str] = []
    for fp, old_id in old_fp_to_id.items():
        new_id = new_fp_to_id.get(fp)
        if new_id is None:
            unmapped.append(f"{old_id} ({fp[0]})")
            continue
        if old_id != new_id:
            id_map[old_id] = new_id

    if unmapped:
        print(f"\n  Unmapped skills (removed from new version):")
        for u in unmapped:
            print(f"    {u}")

    print(f"\n  ID shifts: {len(id_map)}")
    for old_id, new_id in sorted(id_map.items(), key=lambda x: (int(x[0]) if x[0].isdigit() else 0, x[0])):
        old_sk = next((s for s in old_skills if s["id"] == old_id), None)
        name = old_sk["name"] if old_sk else "?"
        if old_id != new_id:
            print(f"    {old_id:>6s} -> {new_id:>6s}  {name}")

    # Build name -> new_id for prerequisites (they reference by old ID)
    old_id_to_new: dict[str, str] = {}
    for fp, old_id in old_fp_to_id.items():
        new_id = new_fp_to_id.get(fp)
        if new_id:
            old_id_to_new[old_id] = new_id

    # Load characters
    print("\nLoading characters...")
    chars = []
    with open(CHARS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            chars.append(json.loads(line))
    print(f"  {len(chars)} characters")

    # Remap (skip protagonist = first line)
    total_remapped = 0
    for idx, char in enumerate(chars):
        if idx == 0:  # Skip protagonist
            print(f"\n  SKIP: {char['name']} (protagonist, line 1)")
            continue

        print(f"\n  {char['name']} ({char['id']}):")
        tree = char["skillTree"]
        remapped_skills = 0
        remapped_prereqs = 0
        removed = 0

        new_tree = []
        for node in tree:
            old_sid = node["skillId"]
            new_sid = old_id_to_new.get(old_sid)

            if new_sid is None:
                # Skill removed in new version
                old_sk = next((s for s in old_skills if s["id"] == old_sid), None)
                name = old_sk["name"] if old_sk else old_sid
                print(f"    REMOVED: {old_sid} ({name}) — not in new skills.jsonl")
                removed += 1
                continue

            if old_sid != new_sid:
                old_sk = next((s for s in old_skills if s["id"] == old_sid), None)
                name = old_sk["name"] if old_sk else old_sid
                print(f"    ID: {old_sid} -> {new_sid}  {name}")
                node["skillId"] = new_sid
                remapped_skills += 1

            # Remap prerequisites
            new_prereqs = []
            for prereq_id in node.get("prerequisites", []):
                new_prereq = old_id_to_new.get(prereq_id)
                if new_prereq is None:
                    old_sk = next((s for s in old_skills if s["id"] == prereq_id), None)
                    name = old_sk["name"] if old_sk else prereq_id
                    print(f"      prereq REMOVED: {prereq_id} ({name})")
                else:
                    if prereq_id != new_prereq:
                        remapped_prereqs += 1
                    new_prereqs.append(new_prereq)

            # Filter prereqs to only those still in the character's skill tree
            # (some prereqs may have been removed above)
            tree_ids = {n["skillId"] for n in new_tree}
            tree_ids.add(node["skillId"])  # Include current node
            valid_prereqs = [p for p in new_prereqs if p in tree_ids]
            if len(valid_prereqs) != len(new_prereqs):
                dropped = set(new_prereqs) - set(valid_prereqs)
                print(f"      prereq cleaned: {sorted(dropped)}")
            node["prerequisites"] = valid_prereqs
            remapped_prereqs += len([p for p in new_prereqs if p in tree_ids and p != (old_id_to_new.get(p) or p)])

            new_tree.append(node)

        char["skillTree"] = new_tree
        total_remapped += remapped_skills + removed
        print(f"    {remapped_skills} ID shifts, {removed} removed, tree: {len(old_skills)} -> {len(new_tree)} skills")

    # Also remap prereqs within each tree (second pass to catch cross-references)
    for idx, char in enumerate(chars):
        tree = char["skillTree"]
        tree_ids = {n["skillId"] for n in tree}
        for node in tree:
            node["prerequisites"] = [p for p in node["prerequisites"] if p in tree_ids]

    # Sort each tree
    for char in chars:
        char["skillTree"].sort(key=lambda n: int(n["skillId"]) if n["skillId"].isdigit() else 0)

    # Write back
    print(f"\nWriting {CHARS_PATH}...")
    with open(CHARS_PATH, "w", encoding="utf-8") as f:
        for char in chars:
            f.write(json.dumps(char, ensure_ascii=False) + "\n")

    print(f"Done. {total_remapped} ID changes across {len(chars)-1} characters.")
    print("Protagonist line was NOT modified.")


if __name__ == "__main__":
    main()
