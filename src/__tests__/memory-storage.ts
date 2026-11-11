import type { StorageAdapter } from '../types.ts';

export interface MemoryStorage extends StorageAdapter {
  /** The underlying map, for assertions in tests. */
  readonly store: Map<string, string>;
}

/** In-memory, synchronous storage for tests. Not part of the published package. */
export function memoryStorage(initial?: Record<string, string>): MemoryStorage {
  const store = new Map<string, string>(initial ? Object.entries(initial) : []);
  return {
    store,
    get: (key) => store.get(key) ?? null,
    set: (key, value) => {
      store.set(key, value);
    },
    remove: (key) => {
      store.delete(key);
    },
  };
}
