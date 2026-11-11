import type { StorageAdapter } from '../types.ts';

/** The subset of the AsyncStorage API this adapter uses. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Storage backed by the AsyncStorage object you pass, e.g. `asyncStorage(AsyncStorage)` with the
 * default export of `@react-native-async-storage/async-storage`. This library never imports it itself.
 * Asynchronous: hooks report nothing as new until the first read finishes.
 */
export function asyncStorage(instance: AsyncStorageLike): StorageAdapter {
  return {
    get: async (key) => (await instance.getItem(key)) ?? null,
    set: (key, value) => instance.setItem(key, value),
    remove: (key) => instance.removeItem(key),
  };
}
