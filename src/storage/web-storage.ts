import type { StorageAdapter } from '../types.ts';

/** The subset of the Web Storage API (`localStorage`, `sessionStorage`) this adapter uses. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Storage backed by the browser's Web Storage, e.g. `webStorage(localStorage)` or
 * `webStorage(sessionStorage)`. Synchronous, so the store is ready on the first render.
 * You pass the instance in, so importing this library never touches `window` (safe for SSR).
 */
export function webStorage(instance: WebStorageLike): StorageAdapter {
  return {
    get: (key) => instance.getItem(key),
    set: (key, value) => instance.setItem(key, value),
    remove: (key) => instance.removeItem(key),
  };
}
