import { describe, expect, it, vi } from 'vitest';
import { asyncStorage, createChangelog, mmkvStorage, webStorage } from '../index.ts';
import type { MMKVLike, WebStorageLike } from '../index.ts';

const entries = [{ id: 'dark-mode' }, { id: 'fix-sync' }] as const;

function fakeMMKV(version: 3 | 4) {
  const map = new Map<string, string>();
  const base = { map, getString: (k: string) => map.get(k), set: (k: string, v: string) => void map.set(k, v) };
  return version === 4
    ? { ...base, remove: (k: string) => map.delete(k) }
    : { ...base, delete: (k: string) => void map.delete(k) };
}

describe('mmkvStorage', () => {
  it.each([3, 4] as const)('works with a v%i instance and is ready immediately', async (version) => {
    const mmkv = fakeMMKV(version);
    const changelog = createChangelog({ storage: mmkvStorage(mmkv as MMKVLike), entries, initialSeen: 'none' });
    expect(changelog.isReady).toBe(true);
    changelog.markSeen('dark-mode');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(mmkv.map.get('changelog')!).seen).toEqual({ 'dark-mode': true });
    await changelog.reset();
    expect(changelog.getEntry('dark-mode').isNew).toBe(true);
  });

  it('maps a missing key to null', () => {
    expect(mmkvStorage(fakeMMKV(4)).get('nope')).toBeNull();
  });
});

describe('asyncStorage', () => {
  it('reads, writes and removes through getItem/setItem/removeItem', async () => {
    const map = new Map<string, string>();
    const storage = asyncStorage({
      getItem: async (k) => map.get(k),
      setItem: async (k, v) => void map.set(k, v),
      removeItem: async (k) => void map.delete(k),
    });
    expect(await storage.get('changelog')).toBeNull();
    await storage.set('changelog', 'x');
    expect(await storage.get('changelog')).toBe('x');
    await storage.remove!('changelog');
    expect(map.has('changelog')).toBe(false);
  });
});

function fakeWebStorage() {
  const map = new Map<string, string>();
  const storage: WebStorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { map, storage };
}

describe('webStorage', () => {
  it('reads, writes and removes, and is ready immediately', async () => {
    const { map, storage } = fakeWebStorage();
    const changelog = createChangelog({ storage: webStorage(storage), entries, initialSeen: 'none' });
    expect(changelog.isReady).toBe(true);
    changelog.markSeen('dark-mode');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(map.get('changelog')!).seen).toEqual({ 'dark-mode': true });
    await changelog.reset();
    // reset() removes the key, then first-launch rules write a fresh, empty record.
    expect(JSON.parse(map.get('changelog')!).seen).toEqual({});
    expect(changelog.getEntry('dark-mode').isNew).toBe(true);
  });

  it('keeps working in memory when setItem throws (quota full, private mode)', async () => {
    const { storage } = fakeWebStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const changelog = createChangelog({ storage: webStorage(storage), entries, initialSeen: 'none' });
    changelog.markSeen('dark-mode');
    await new Promise((r) => setTimeout(r, 0));
    expect(changelog.getEntry('dark-mode').isNew).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats everything as seen when getItem throws (storage blocked)', () => {
    const { storage } = fakeWebStorage();
    storage.getItem = () => {
      throw new Error('SecurityError');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const changelog = createChangelog({ storage: webStorage(storage), entries, initialSeen: 'none' });
    expect(changelog.isReady).toBe(true);
    expect(changelog.getEntries({ isNew: true }).entries).toEqual([]);
    warn.mockRestore();
  });
});
