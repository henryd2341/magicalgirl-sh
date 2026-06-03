import {
  getAccessAtPath,
  isContextVisible,
} from "@/orchestrator/schemaReader";
import type { GameVariablesRoot, PreviousValueMap } from "@/types/variables";

function yamlEscape(value: string): string {
  if (
    value.includes("#") ||
    value.includes(":") ||
    /^\s/.test(value) ||
    /\s$/.test(value) ||
    value === "" ||
    /[\n\r]/.test(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function renderLeaf(
  key: string,
  value: unknown,
  path: string,
  indent: string,
  prevValues?: PreviousValueMap,
): string {
  const access = getAccessAtPath(path);
  const parts: string[] = [];

  let formatted: string;
  if (typeof value === "string") {
    formatted = yamlEscape(value);
  } else if (value === null || value === undefined) {
    formatted = "null";
  } else if (typeof value === "boolean") {
    formatted = value ? "true" : "false";
  } else {
    formatted = String(value);
  }

  parts.push(`${indent}${key}: ${formatted}`);

  const annotations: string[] = [];
  if (access !== "hidden") {
    annotations.push(access);
  }

  if (
    prevValues?.has(path) &&
    typeof value === "number"
  ) {
    const oldValue = prevValues.get(path);
    annotations.push(`last_value="${oldValue}"`);
  }

  if (annotations.length > 0) {
    parts.push(`  # ${annotations.join(", ")}`);
  }

  return parts.join("");
}

function renderValue(
  key: string,
  value: unknown,
  path: string,
  depth: number,
  prevValues?: PreviousValueMap,
): string[] {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  if (!isContextVisible(path)) {
    return lines;
  }

  if (value === null || value === undefined) {
    lines.push(renderLeaf(key, null, path, indent, prevValues));
    return lines;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${indent}${key}: []`);
    } else {
      lines.push(`${indent}${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const subLines = renderValue("-", item, path, depth + 1, prevValues);
          for (const line of subLines) {
            const indented = line.replace(/^(\s*)-/, "  -");
            lines.push(indented);
          }
        } else {
          lines.push(`${indent}  - ${yamlEscape(String(item))}`);
        }
      }
    }
    return lines;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      lines.push(`${indent}${key}: {}`);
      return lines;
    }

    lines.push(`${indent}${key}:`);
    const sortedEntries = entries.sort(([a], [b]) => a.localeCompare(b));

    for (const [childKey, childValue] of sortedEntries) {
      const childPath = path ? `${path}.${childKey}` : childKey;

      if (!isContextVisible(childPath)) {
        continue;
      }

      if (
        childValue !== null &&
        childValue !== undefined &&
        typeof childValue === "object" &&
        !Array.isArray(childValue)
      ) {
        const subLines = renderValue(
          childKey,
          childValue,
          childPath,
          depth + 1,
          prevValues,
        );
        lines.push(...subLines);
      } else if (Array.isArray(childValue)) {
        const subLines = renderValue(
          childKey,
          childValue,
          childPath,
          depth + 1,
          prevValues,
        );
        lines.push(...subLines);
      } else {
        lines.push(
          renderLeaf(childKey, childValue, childPath, indent + "  ", prevValues),
        );
      }
    }
    return lines;
  }

  lines.push(renderLeaf(key, value, path, indent, prevValues));
  return lines;
}

export function serializeVariableStateToYaml(
  root: GameVariablesRoot,
  prevValues?: PreviousValueMap,
): string {
  const header = "游戏状态快照:";
  const bodyLines = renderValue("", root, "", 0, prevValues);

  const body = bodyLines
    .filter((line) => !line.match(/^:\s*$/))
    .map((line) => line.replace(/^:\s*/, ""))
    .join("\n");

  return `${header}\n${body}`;
}

export function serializeVariableSnapshot(
  root: GameVariablesRoot,
  prevValues?: PreviousValueMap,
): string {
  return serializeVariableStateToYaml(root, prevValues);
}
