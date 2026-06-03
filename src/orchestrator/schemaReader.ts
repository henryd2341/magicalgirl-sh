import schema from "@/content/variableDefs/gameVariablesRoot.schema.json";

interface PathAnnotation {
  access: "read_only" | "read_write" | "hidden";
  contextVisible: boolean;
}

type SchemaNode = Record<string, unknown> & {
  properties?: Record<string, SchemaNode>;
  additionalProperties?: SchemaNode | boolean;
  items?: SchemaNode;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
  $ref?: string;
  type?: string;
  enum?: unknown[];
  "x-aiAccess"?: string;
  "x-aiContext"?: boolean;
};

const annotationCache = new Map<string, PathAnnotation>();

function resolveRef(ref: string): SchemaNode | null {
  if (!ref.startsWith("#/")) return null;
  const segments = ref.slice(2).split("/");
  let node: unknown = schema;
  for (const seg of segments) {
    if (node && typeof node === "object" && seg in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return null;
    }
  }
  return node as SchemaNode;
}

function findAnnotationFromNode(
  node: SchemaNode,
  visited: Set<unknown> = new Set(),
): { access: string; contextVisible: boolean } {
  if (visited.has(node)) return { access: "read_only", contextVisible: true };
  visited.add(node);

  const access = node["x-aiAccess"];
  const context = node["x-aiContext"];

  if (node.$ref) {
    const resolved = resolveRef(node.$ref);
    if (resolved) {
      const refAnnotation = findAnnotationFromNode(resolved, visited);
      return {
        access: access ?? refAnnotation.access,
        contextVisible: context ?? refAnnotation.contextVisible,
      };
    }
  }

  return {
    access: access ?? "read_only",
    contextVisible: context !== false,
  };
}

function findBestBranch(nodes: SchemaNode[]): SchemaNode | null {
  for (const node of nodes) {
    if (node.$ref) return node;
  }
  for (const node of nodes) {
    if (node.type === "object" || node.properties) return node;
  }
  return nodes[0] ?? null;
}

function walkSchema(
  node: SchemaNode,
  currentPath: string,
  parentAccess: string,
  parentContext: boolean,
  visited: Map<unknown, Set<string>>,
): void {
  const nodePaths = visited.get(node);
  if (nodePaths?.has(currentPath)) return;
  if (nodePaths) {
    nodePaths.add(currentPath);
  } else {
    visited.set(node, new Set([currentPath]));
  }

  const access = node["x-aiAccess"] ?? parentAccess;
  const contextVisible = node["x-aiContext"] !== undefined
    ? node["x-aiContext"] as boolean
    : parentContext;

  // Cache annotations for explicitly-annotated object nodes so that
  // isContextVisible() can find them at the object level.
  if (
    currentPath &&
    (node["x-aiAccess"] !== undefined || node["x-aiContext"] !== undefined)
  ) {
    annotationCache.set(currentPath, {
      access: access as "read_only" | "read_write" | "hidden",
      contextVisible,
    });
  }

  if (node.$ref && !node.properties && !node.additionalProperties && !node.oneOf) {
    const resolved = resolveRef(node.$ref);
    if (resolved) {
      walkSchema(resolved, currentPath, access, contextVisible, visited);
    }
    return;
  }

  if (node.oneOf || node.anyOf) {
    const branches = node.oneOf ?? node.anyOf ?? [];
    const best = findBestBranch(branches);
    if (best) {
      walkSchema(best, currentPath, access, contextVisible, visited);
    }
    return;
  }

  if (node.properties) {
    for (const [key, childNode] of Object.entries(node.properties)) {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      const childAccess = childNode["x-aiAccess"] ?? access;
      const childContext = childNode["x-aiContext"] !== undefined
        ? (childNode["x-aiContext"] as boolean)
        : contextVisible;

      if (childNode.properties || childNode.additionalProperties || childNode.$ref || childNode.oneOf || childNode.anyOf) {
        if (childNode.$ref) {
          const resolved = resolveRef(childNode.$ref);
          if (resolved) {
            walkSchema(resolved, childPath, childAccess, childContext, visited);
          }
        } else {
          walkSchema(childNode, childPath, childAccess, childContext, visited);
        }
      } else if (
        (childNode.type === "object" || childNode.propertyNames) &&
        childNode.additionalProperties
      ) {
        annotationCache.set(`${childPath}.*`, {
          access: childAccess as "read_only" | "read_write" | "hidden",
          contextVisible: childContext,
        });
      } else {
        annotationCache.set(childPath, {
          access: childAccess as "read_only" | "read_write" | "hidden",
          contextVisible: childContext,
        });
      }
    }
  }

  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    const apNode = node.additionalProperties as SchemaNode;
    if (apNode.$ref) {
      const resolved = resolveRef(apNode.$ref);
      if (resolved) {
        walkSchema(resolved, `${currentPath}.*`, access, contextVisible, visited);
      }
    } else {
      // Primitive-type additionalProperties (e.g., Record<string, number>)
      annotationCache.set(`${currentPath}.*`, {
        access: access as "read_only" | "read_write" | "hidden",
        contextVisible,
      });
    }
  }
}

function buildCache(): void {
  if (annotationCache.size > 0) return;
  const root = schema as unknown as SchemaNode;
  walkSchema(root, "", "read_only", true, new Map());
}

function matchWildcardPath(
  runtimePath: string,
  cachedKey: string,
): boolean {
  const runtimeSegments = runtimePath.split(".");
  const cachedSegments = cachedKey.split(".");

  if (runtimeSegments.length !== cachedSegments.length) return false;

  for (let i = 0; i < cachedSegments.length; i++) {
    if (cachedSegments[i] === "*") continue;
    if (cachedSegments[i] !== runtimeSegments[i]) return false;
  }

  return true;
}

function lookupAnnotation(
  path: string,
): PathAnnotation | undefined {
  buildCache();

  const exact = annotationCache.get(path);
  if (exact) return exact;

  for (const [cachedKey, annotation] of annotationCache) {
    if (cachedKey.includes("*") && matchWildcardPath(path, cachedKey)) {
      return annotation;
    }
  }

  return undefined;
}

export function getAccessAtPath(path: string): "read_only" | "read_write" | "hidden" {
  const found = lookupAnnotation(path);
  if (found) return found.access;

  const segments = path.split(".");
  for (let i = segments.length - 1; i >= 0; i--) {
    const prefix = segments.slice(0, i).join(".");
    const wildcardKey = prefix ? `${prefix}.*` : "*";
    const wildcard = annotationCache.get(wildcardKey);
    if (wildcard) return wildcard.access;
  }

  return "read_only";
}

export function isContextVisible(path: string): boolean {
  const found = lookupAnnotation(path);
  if (found) return found.contextVisible;

  const segments = path.split(".");
  // Check each ancestor: first try `prefix.*` (wildcard), then `prefix` (exact object path)
  for (let i = segments.length - 1; i >= 0; i--) {
    const prefix = segments.slice(0, i).join(".");
    const wildcardKey = prefix ? `${prefix}.*` : "*";
    const wildcard = annotationCache.get(wildcardKey);
    if (wildcard && !wildcard.contextVisible) return false;

    // Also check if the direct ancestor path has a cached annotation
    if (prefix) {
      const ancestor = annotationCache.get(prefix);
      if (ancestor && !ancestor.contextVisible) return false;
    }
  }

  return true;
}

export function getWritablePaths(): string[] {
  buildCache();
  const paths: string[] = [];
  for (const [path, ann] of annotationCache) {
    if (ann.access === "read_write" && ann.contextVisible) {
      paths.push(path);
    }
  }
  return paths.sort();
}

export function getReadOnlyPaths(): string[] {
  buildCache();
  const paths: string[] = [];
  for (const [path, ann] of annotationCache) {
    if (ann.access === "read_only" && ann.contextVisible) {
      paths.push(path);
    }
  }
  return paths.sort();
}
