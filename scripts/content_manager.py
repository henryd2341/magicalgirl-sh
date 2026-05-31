#!/usr/bin/env python3
"""Content manager for JSONL files (skills.jsonl, items.jsonl, etc.)

Insert, delete, or list entries with automatic ID renumbering.
Interactive mode provides field-by-field guided input.

Usage:
  python scripts/content_manager.py                        # interactive mode
  python scripts/content_manager.py <type> list            # batch: show all
  python scripts/content_manager.py <type> append <json>   # batch: append
  python scripts/content_manager.py <type> insert <pos> <json>  # batch: insert
  python scripts/content_manager.py <type> delete --id <id>     # batch: delete by id
  python scripts/content_manager.py <type> delete --line <n>    # batch: delete by line
"""

import json
import os
import sys
from typing import Any

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Config ──

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "content")

CONTENT_FILES: dict[str, str] = {
    "items": "items.jsonl",
    "skills": "skills.jsonl",
}

# ── Field schemas for interactive input ──

FieldDef = dict[str, Any]

ITEM_FIELDS: list[FieldDef] = [
    # Required
    {"name": "name", "type": "str", "required": True, "hint": "物品名称"},
    {"name": "type", "type": "enum", "required": True, "hint": "物品类型",
     "options": ["consumable", "accessory"]},
    {"name": "tier", "type": "enum", "required": True, "hint": "稀有度",
     "options": ["common", "uncommon", "rare", "legendary"]},
    {"name": "price", "type": "int", "required": True, "hint": "价格 (Gold)"},
    {"name": "description", "type": "str", "required": True, "hint": "描述文本"},
    # Optional - consumable
    {"name": "healHp", "type": "int", "required": False, "hint": "回复HP量"},
    {"name": "healMp", "type": "int", "required": False, "hint": "回复MP量"},
    {"name": "usableInBattle", "type": "bool", "required": False, "default": "true",
     "hint": "战斗中可用?"},
    {"name": "revivePercent", "type": "int", "required": False,
     "hint": "复活回复HP比例 (25|50|100)"},
    {"name": "cureStatus", "type": "str_list", "required": False,
     "hint": "治愈的状态ID (逗号分隔)",
     "note": "poison, sleep, seal, blind, freeze, paralyze, burn"},
    {"name": "damageFixed", "type": "int", "required": False, "hint": "固定伤害值"},
    # Optional - accessory
    {"name": "modifiers.atk", "type": "int", "required": False, "hint": "饰品: ATK+"},
    {"name": "modifiers.def", "type": "int", "required": False, "hint": "饰品: DEF+"},
    {"name": "modifiers.agi", "type": "int", "required": False, "hint": "饰品: AGI+"},
    {"name": "modifiers.int", "type": "int", "required": False, "hint": "饰品: INT+"},
    {"name": "accessoryEffects", "type": "enum_list", "required": False,
     "hint": "饰品特效 (逗号分隔)",
     "options": ["auto_buff_start", "no_press_penalty", "pass_free", "miss_consume_all"]},
    {"name": "affinityResist", "type": "str_done", "required": False,
     "hint": "属性耐性 (逐个输入 元素=等级, 空行结束)",
     "note": "元素: Physical|Fire|Ice|Wind|Electric|Earth|Light|Dark|Ailment\n"
            "       等级: resist|nullify|reflect|absorb\n"
            "       例: Fire=resist 然后回车, 再 Wind=nullify, 最后空行结束"},
]

SKILL_FIELDS: list[FieldDef] = [
    {"name": "name", "type": "str", "required": True, "hint": "技能名称"},
    {"name": "category", "type": "enum", "required": True, "hint": "技能类别",
     "options": ["physical", "magic", "heal", "support", "passive"]},
    {"name": "element", "type": "str", "required": True, "hint": "元素",
     "note": "Physical|Fire|Ice|Electric|Wind|Earth|Light|Dark|Almighty|Heal|Ailment"},
    {"name": "power", "type": "int", "required": True, "hint": "威力"},
    {"name": "mpCost", "type": "int", "required": True, "hint": "MP消耗"},
    {"name": "targetType", "type": "enum", "required": True, "hint": "目标类型",
     "options": ["single_enemy", "all_enemies", "single_ally", "all_allies", "self"]},
    {"name": "accuracy", "type": "int", "required": True, "hint": "命中率 (0-200)"},
    {"name": "statDriver", "type": "enum", "required": True, "hint": "伤害驱动属性",
     "options": ["attack", "intelligence"]},
    {"name": "description", "type": "str", "required": True, "hint": "描述文本"},
    {"name": "critRate", "type": "int", "required": False, "hint": "额外暴击率"},
    {"name": "hitCount", "type": "int", "required": False, "hint": "最小攻击次数"},
    {"name": "hitCountMax", "type": "int", "required": False, "hint": "最大攻击次数"},
]

FIELD_SCHEMAS: dict[str, list[FieldDef]] = {
    "items": ITEM_FIELDS,
    "skills": SKILL_FIELDS,
}


# ── Utility ──

def resolve_path(content_type: str) -> str:
    if content_type not in CONTENT_FILES:
        print(f"未知内容类型: {content_type}")
        print(f"可用: {', '.join(CONTENT_FILES)}")
        sys.exit(1)
    return os.path.normpath(os.path.join(CONTENT_DIR, CONTENT_FILES[content_type]))


def read_entries(path: str) -> list[dict[str, Any]]:
    if not os.path.exists(path):
        print(f"文件不存在: {path}")
        sys.exit(1)
    entries: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                entries.append(json.loads(stripped))
            except json.JSONDecodeError as e:
                print(f"JSON 解析错误 (行 {line_no}): {e}")
                sys.exit(1)
    return entries


def write_entries(path: str, entries: list[dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ── ID handling ──

def is_numeric_id(entry: dict[str, Any]) -> bool:
    raw = entry.get("id")
    if raw is None or not isinstance(raw, str):
        return False
    if raw.startswith("_"):
        return True
    return raw.isdigit()


def renumber_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counter = 1
    for entry in entries:
        if is_numeric_id(entry):
            entry["id"] = str(counter)
            counter += 1
    return entries


# ── Display ──

ID_W = 8
NAME_W = 20
TYPE_W = 14


def format_entry(index: int, entry: dict[str, Any]) -> str:
    eid = entry.get("id", "?")
    name = entry.get("name", "?")
    etype = entry.get("type", entry.get("category", "?"))
    desc = entry.get("description", "")
    if len(desc) > 60:
        desc = desc[:57] + "..."
    return (
        f"  {index:>3}  {eid:<{ID_W}}  {name:<{NAME_W}}  {etype:<{TYPE_W}}  {desc}"
    )


def print_header() -> None:
    h = f"  {'#':>3}  {'ID':<{ID_W}}  {'名称':<{NAME_W}}  {'类型':<{TYPE_W}}  描述"
    print(h)
    print("-" * len(h))


def list_entries(entries: list[dict[str, Any]], page: int = 1, ps: int = 20) -> None:
    if not entries:
        print("(空)")
        return
    lo = (page - 1) * ps
    hi = min(lo + ps, len(entries))
    print_header()
    for i, e in enumerate(entries[lo:hi], lo + 1):
        print(format_entry(i, e))
    tp = max(1, (len(entries) + ps - 1) // ps)
    pi = f"第 {page}/{tp} 页" if tp > 1 else ""
    print(f"\n共 {len(entries)} 条  {pi}")


def print_entry_detail(entry: dict[str, Any]) -> None:
    print(json.dumps(entry, ensure_ascii=False, indent=2))


# ── Batch actions ──

def cmd_list(content_type: str) -> None:
    path = resolve_path(content_type)
    entries = read_entries(path)
    print(f"\n  [{CONTENT_FILES[content_type]}]\n")
    list_entries(entries)


def _add_entry(content_type: str, new_entry: dict[str, Any],
               position: int | None) -> None:
    """Shared logic for append/insert."""
    path = resolve_path(content_type)
    entries = read_entries(path)
    if "id" not in new_entry:
        new_entry["id"] = "_new"
    if position is None:
        entries.append(new_entry)
    else:
        pos = max(1, min(position, len(entries) + 1))
        entries.insert(pos - 1, new_entry)
    entries = renumber_entries(entries)
    write_entries(path, entries)
    print(f"已保存 (共 {len(entries)} 条)")


def cmd_append_json(content_type: str, json_str: str) -> None:
    try:
        new_entry = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"JSON 解析错误: {e}")
        sys.exit(1)
    _add_entry(content_type, new_entry, None)
    print(f"  新条目: name={new_entry.get('name', '?')}")


def cmd_insert_json(content_type: str, position: str, json_str: str) -> None:
    try:
        pos = int(position)
    except ValueError:
        print(f"位置必须是数字: {position}")
        sys.exit(1)
    try:
        new_entry = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"JSON 解析错误: {e}")
        sys.exit(1)
    _add_entry(content_type, new_entry, pos)
    print(f"  第 {pos} 位: name={new_entry.get('name', '?')}")


def cmd_delete(content_type: str, by_id: str | None, by_line: str | None) -> None:
    path = resolve_path(content_type)
    entries = read_entries(path)
    target = None
    if by_id is not None:
        for e in entries:
            if e.get("id") == by_id:
                target = e
                break
        if target is None:
            print(f"未找到 id={by_id}")
            sys.exit(1)
    elif by_line is not None:
        try:
            ln = int(by_line)
        except ValueError:
            print(f"行号必须是数字: {by_line}")
            sys.exit(1)
        if ln < 1 or ln > len(entries):
            print(f"行号超出范围 (1-{len(entries)}): {ln}")
            sys.exit(1)
        target = entries[ln - 1]
    else:
        print("请指定 --id <id> 或 --line <n>")
        sys.exit(1)
    entries.remove(target)
    entries = renumber_entries(entries)
    write_entries(path, entries)
    print(f"已删除: id={target['id']}, name={target.get('name', '?')}")
    print(f"  剩余 {len(entries)} 条, ID 已重新编号")


# ── Interactive field-by-field input ──

def _prompt(text: str, default: str = "") -> str:
    if default:
        result = input(f"  {text} [{default}]: ").strip()
        return result if result else default
    return input(f"  {text}: ").strip()


def _prompt_yesno(text: str, default: bool = True) -> bool:
    yn = "Y/n" if default else "y/N"
    result = input(f"  {text} ({yn}): ").strip().lower()
    if not result:
        return default
    return result in ("y", "yes")


def _input_field(field: FieldDef) -> Any:
    """Prompt for a single field value with validation. Returns None to skip."""
    name = field["name"]
    ftype = field["type"]
    hint = field.get("hint", name)
    note = field.get("note", "")
    options = field.get("options", [])

    if note:
        print(f"  ({note})")

    while True:
        if ftype == "str":
            val = _prompt(hint)
            if not val and not field.get("required"):
                return None
            if val:
                return val
            if field.get("required"):
                print("  必填字段")

        elif ftype == "int":
            val = _prompt(hint, str(field.get("default", "")))
            if not val and not field.get("required"):
                return None
            if val.lstrip("-").isdigit():
                return int(val)
            print("  请输入整数")

        elif ftype == "bool":
            return _prompt_yesno(hint, field.get("default", "true") == "true")

        elif ftype == "enum":
            opts_str = "/".join(options)
            val = _prompt(f"{hint} ({opts_str})", field.get("default", ""))
            if not val and not field.get("required"):
                return None
            if val in options:
                return val
            if val and len(val) <= 2:
                # Try matching by prefix
                for o in options:
                    if o.startswith(val):
                        return o
            print(f"  无效值, 可选: {opts_str}")

        elif ftype == "enum_list":
            if not options:
                return None
            opts_str = "/".join(options)
            val = _prompt(f"{hint} ({opts_str})")
            if not val:
                return None
            selected = [v.strip() for v in val.split(",") if v.strip()]
            valid = [s for s in selected if s in options]
            if valid:
                return valid
            print(f"  无效值, 可选: {opts_str}")

        elif ftype == "str_list":
            val = _prompt(hint)
            if not val:
                return None
            return [v.strip() for v in val.split(",") if v.strip()]

        elif ftype == "str_done":
            # Repeated key=value input, empty line to finish
            print(f"  {hint}:")
            result: dict[str, str] = {}
            while True:
                kv = input("    > ").strip()
                if not kv:
                    break
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    result[k.strip()] = v.strip()
            return result if result else None

        else:
            return _prompt(hint)


def _build_entry_interactive(content_type: str) -> dict[str, Any] | None:
    """Field-by-field interactive entry builder. Returns None if cancelled."""
    fields = FIELD_SCHEMAS.get(content_type, [])
    if not fields:
        print("  该类型暂无交互式字段定义, 请使用批处理模式")
        return None

    required_fields = [f for f in fields if f.get("required")]
    optional_fields = [f for f in fields if not f.get("required")]

    print()
    print(f"  --- 新建 {CONTENT_FILES[content_type]} 条目 ---")
    print(f"  必填字段: {', '.join(f['name'] for f in required_fields)}")
    print(f"  输入 . 跳过, 空行取消, Ctrl+C 退出")
    print()

    entry: dict[str, Any] = {}

    # Required fields
    for field in required_fields:
        val = _input_field(field)
        if val is None:
            print("  已取消")
            return None
        # Handle dotted paths like "modifiers.atk"
        if "." in field["name"]:
            parts = field["name"].split(".")
            d = entry
            for p in parts[:-1]:
                if p not in d:
                    d[p] = {}
                d = d[p]
            d[parts[-1]] = val
        else:
            entry[field["name"]] = val

    # Optional fields - ask if user wants to fill them
    print()
    show_optional = _prompt_yesno("是否填写可选字段?", True)
    if show_optional:
        for field in optional_fields:
            print()
            use = _prompt_yesno(f"填写 {field['hint']}?", False)
            if not use:
                continue
            val = _input_field(field)
            if val is None:
                continue
            if "." in field["name"]:
                parts = field["name"].split(".")
                d = entry
                for p in parts[:-1]:
                    if p not in d:
                        d[p] = {}
                    d = d[p]
                d[parts[-1]] = val
            else:
                entry[field["name"]] = val

    # Clean up empty modifiers
    if "modifiers" in entry and isinstance(entry["modifiers"], dict):
        if not any(v is not None for v in entry["modifiers"].values()):
            del entry["modifiers"]
        else:
            entry["modifiers"] = {k: v for k, v in entry["modifiers"].items()
                                  if v is not None}

    print()
    print("  --- 预览 ---")
    print_entry_detail(entry)
    print()
    confirm = _prompt_yesno("确认保存?", True)
    if not confirm:
        print("  已取消")
        return None
    return entry


# ── Interactive CUI ──

def _pick_content_type() -> str:
    print()
    types = list(CONTENT_FILES)
    for i, t in enumerate(types, 1):
        print(f"  [{i}] {t}  ({CONTENT_FILES[t]})")
    print()
    while True:
        choice = _prompt("选择内容类型", "1")
        if choice.isdigit() and 0 < int(choice) <= len(types):
            return types[int(choice) - 1]
        if choice in types:
            return choice
        print(f"  无效, 请输入 1-{len(types)} 或类型名")


def _show_menu(content_type: str, entry_count: int) -> None:
    filename = CONTENT_FILES[content_type]
    print()
    print(f"  === {filename} ({entry_count} 条) ===")
    print()
    print("  [L] 列出条目    [V] 查看详情    [N] 新建条目")
    print("  [I] 插入条目    [D] 删除条目    [Q] 退出")
    print()


def _interactive_list(entries: list[dict[str, Any]]) -> None:
    ps = 20
    tp = max(1, (len(entries) + ps - 1) // ps)
    page = 1
    while True:
        print()
        list_entries(entries, page, ps)
        if tp <= 1:
            input("\n按 Enter 返回...")
            return
        nav = _prompt(f"页码 (1-{tp}) 或 Enter 返回")
        if not nav:
            return
        if nav.isdigit() and 1 <= int(nav) <= tp:
            page = int(nav)


def _interactive_view(entries: list[dict[str, Any]]) -> None:
    sel = _prompt("行号 # 或 ID")
    if not sel:
        return
    if sel.isdigit():
        idx = int(sel) - 1
        if 0 <= idx < len(entries):
            print()
            print_entry_detail(entries[idx])
            print()
            input("按 Enter 返回...")
            return
    for e in entries:
        if e.get("id") == sel:
            print()
            print_entry_detail(e)
            print()
            input("按 Enter 返回...")
            return
    print(f"  未找到: {sel}")


def _interactive_new(content_type: str) -> None:
    entry = _build_entry_interactive(content_type)
    if entry is not None:
        try:
            _add_entry(content_type, entry, None)
        except SystemExit:
            pass


def _interactive_insert_at(content_type: str, entries: list[dict[str, Any]]) -> None:
    pos_str = _prompt(f"插入位置 (1-{len(entries)+1})", str(len(entries) + 1))
    if not pos_str.isdigit():
        print("  位置必须是数字")
        return
    entry = _build_entry_interactive(content_type)
    if entry is not None:
        try:
            _add_entry(content_type, entry, int(pos_str))
        except SystemExit:
            pass


def _interactive_delete(content_type: str, entries: list[dict[str, Any]]) -> None:
    print()
    print("  按 ID 删除: 直接输入 id")
    print("  按行号删除: 输入 #行号 (如 #5)")
    print()
    sel = _prompt("ID 或 #行号")
    if not sel:
        return
    if sel.startswith("#"):
        ls = sel[1:].strip()
        if not ls.isdigit():
            print("  无效行号")
            return
        ln = int(ls)
        if ln < 1 or ln > len(entries):
            print(f"  行号超出范围 (1-{len(entries)})")
            return
        target = entries[ln - 1]
    else:
        target = next((e for e in entries if e.get("id") == sel), None)
        if target is None:
            print(f"  未找到 id={sel}")
            return
    print()
    print(f"  将删除: id={target['id']}, name={target.get('name', '?')}")
    if _prompt_yesno("确认删除?", False):
        try:
            cmd_delete(content_type, target["id"], None)
        except SystemExit:
            pass


def _interactive_loop(content_type: str) -> None:
    while True:
        entries = read_entries(resolve_path(content_type))
        _show_menu(content_type, len(entries))
        choice = _prompt(">>>").strip().lower()
        if choice in ("q", "quit", "exit"):
            print("  再见.")
            break
        elif choice in ("l", "list"):
            _interactive_list(entries)
        elif choice in ("v", "view"):
            _interactive_view(entries)
        elif choice in ("n", "new", "a", "append"):
            _interactive_new(content_type)
        elif choice in ("i", "insert"):
            _interactive_insert_at(content_type, entries)
        elif choice in ("d", "delete"):
            _interactive_delete(content_type, entries)
        elif choice == "":
            continue
        else:
            print("  未知命令. 可用: L V N I D Q")


# ── Main ──

def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-i", "--interactive"):
        print()
        print("  === JSONL 内容管理器 ===")
        ct = _pick_content_type()
        _interactive_loop(ct)
        return
    if args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    ct = args[0]
    action = args[1] if len(args) > 1 else "list"
    if ct not in CONTENT_FILES:
        print(f"未知内容类型: {ct}")
        print(f"可用: {', '.join(CONTENT_FILES)}")
        sys.exit(1)
    if action == "list":
        cmd_list(ct)
    elif action == "append":
        if len(args) < 3:
            print("用法: ... <type> append <json>")
            sys.exit(1)
        cmd_append_json(ct, args[2])
    elif action == "insert":
        if len(args) < 4:
            print("用法: ... <type> insert <pos> <json>")
            sys.exit(1)
        cmd_insert_json(ct, args[2], args[3])
    elif action == "delete":
        by_id: str | None = None
        by_line: str | None = None
        i = 2
        while i < len(args):
            if args[i] == "--id" and i + 1 < len(args):
                by_id = args[i + 1]; i += 2
            elif args[i] == "--line" and i + 1 < len(args):
                by_line = args[i + 1]; i += 2
            else:
                i += 1
        cmd_delete(ct, by_id, by_line)
    else:
        print(f"未知操作: {action}")
        sys.exit(1)


if __name__ == "__main__":
    main()
