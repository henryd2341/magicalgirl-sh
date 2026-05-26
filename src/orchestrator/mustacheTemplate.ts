import type { VariableValueRecord } from "@/types/variables";

const MUSTACHE_ALIAS_PATHS = new Map<string, string>([
  ["user", "player.profile.name"],
]);

export type MustacheResolutionStatus =
  | "resolved"
  | "defaulted"
  | "unresolved";

export interface MustacheResolution {
  token: string;
  key: string;
  resolvedPath: string;
  value: string | number | boolean | null;
  status: MustacheResolutionStatus;
}

export interface RenderMustacheTemplateResult {
  text: string;
  resolutions: MustacheResolution[];
}

interface ParsedMustacheToken {
  key: string;
  defaultValue?: string;
}

function parseMustacheToken(rawToken: string): ParsedMustacheToken {
  const coalesceParts = rawToken.split(/\s+\?\?\s+/, 2);
  if (coalesceParts.length === 2) {
    return {
      key: coalesceParts[0].trim(),
      defaultValue: coalesceParts[1].trim(),
    };
  }

  const defaultPipe = rawToken.match(/^(.+?)\|default=(.*)$/);
  if (defaultPipe) {
    return {
      key: defaultPipe[1].trim(),
      defaultValue: defaultPipe[2].trim(),
    };
  }

  return {
    key: rawToken.trim(),
  };
}

function resolveMustachePath(key: string): string {
  return MUSTACHE_ALIAS_PATHS.get(key) ?? key;
}

function isMissingMustacheValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function resolveVariablePath(source: unknown, path: string): unknown {
  const segments = path.split(".");
  let current = source;

  for (const segmentName of segments) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, segmentName)
    ) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segmentName];
  }

  if (
    current === null ||
    typeof current === "string" ||
    typeof current === "number" ||
    typeof current === "boolean"
  ) {
    return current;
  }

  return undefined;
}

export function renderMustacheTemplate(
  template: string,
  variableState?: VariableValueRecord,
  variables: Record<string, string | number | boolean | null> = {},
): RenderMustacheTemplateResult {
  const resolutions: MustacheResolution[] = [];
  const text = template.replace(
    /{{\s*([^{}]+?)\s*}}/g,
    (token, rawToken: string) => {
      const parsed = parseMustacheToken(rawToken);
      const key = parsed.key;
      const resolvedPath = resolveMustachePath(key);
      let value: unknown;

      if (!Object.prototype.hasOwnProperty.call(variables, key)) {
        value = resolveVariablePath(variableState?.root, resolvedPath);
      } else {
        value = variables[key];
      }

      if (isMissingMustacheValue(value)) {
        if (parsed.defaultValue !== undefined) {
          resolutions.push({
            token,
            key,
            resolvedPath,
            value: parsed.defaultValue,
            status: "defaulted",
          });
          return parsed.defaultValue;
        }

        resolutions.push({
          token,
          key,
          resolvedPath,
          value: null,
          status: "unresolved",
        });
        return token;
      }

      const renderedValue = String(value);
      resolutions.push({
        token,
        key,
        resolvedPath,
        value: renderedValue,
        status: "resolved",
      });
      return renderedValue;
    },
  );

  return {
    text,
    resolutions,
  };
}
