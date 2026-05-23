/* eslint-disable no-undef */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
