/** `'settings'` matches `'settings'` and `'settings.export'`, but not `'settings2'`. */
export function matchesGroup(groups: readonly string[] | undefined, query: string): boolean {
  if (!groups) return false;
  const prefix = `${query}.`;
  return groups.some((g) => g === query || g.startsWith(prefix));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Every key in `filter` must strictly equal the same key in `data`.
 * Plain objects recurse; arrays and other values compare with `===`.
 */
export function matchesData(data: unknown, filter: unknown): boolean {
  if (!isPlainObject(filter)) return data === filter;
  if (!isPlainObject(data)) return false;
  for (const key of Object.keys(filter)) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return false;
    if (!matchesData(data[key], filter[key])) return false;
  }
  return true;
}
