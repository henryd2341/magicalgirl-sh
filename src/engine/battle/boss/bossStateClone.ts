export function cloneBossStateValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneBossStateValue(entry)) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof Map) {
    return new Map(
      [...value.entries()].map(([key, entry]) => [
        cloneBossStateValue(key),
        cloneBossStateValue(entry),
      ]),
    ) as T;
  }

  if (value instanceof Set) {
    return new Set([...value].map((entry) => cloneBossStateValue(entry))) as T;
  }

  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneBossStateValue(entry),
      ]),
    ) as T;
  }

  return value;
}
