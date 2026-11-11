import type { StorageAdapter } from '../types.ts';

/** The subset of an MMKV instance this adapter uses (works with react-native-mmkv v3 and v4). */
export interface MMKVLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  /** v4 */
  remove?(key: string): unknown;
  /** v3 */
  delete?(key: string): unknown;
}

/**
 * Storage backed by a `react-native-mmkv` instance you create, e.g. `mmkvStorage(createMMKV())` (v4)
 * or `mmkvStorage(new MMKV())` (v3). Synchronous, so the store is ready on the first render.
 * This library never imports react-native-mmkv itself.
 */
export function mmkvStorage(instance: MMKVLike): StorageAdapter {
  return {
    get: (key) => instance.getString(key) ?? null,
    set: (key, value) => instance.set(key, value),
    remove: (key) => {
      if (typeof instance.remove === 'function') instance.remove(key);
      else instance.delete?.(key);
    },
  };
}
