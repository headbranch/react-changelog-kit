import { describe, expect, it, vi } from 'vitest';
import { createChangelog } from '../index.ts';
import { memoryStorage } from './memory-storage.ts';
import type { InitialSeenOption, StorageAdapter } from '../types.ts';

const entries = [
  {
    id: 'dark-mode',
    channels: ['popup', 'badge'],
    groups: ['settings.appearance'],
    data: { title: 'Dark mode', audience: 'all', meta: { tier: 'free' } },
  },
  { id: 'fix-sync', channels: ['popup'], data: { title: 'Fixed sync', audience: 'all', meta: { tier: 'free' } } },
  {
    id: 'voice-notes',
    channels: ['badge'],
    groups: ['editor', 'onboarding.tips'],
    data: { title: 'Voice notes', audience: 'pro', meta: { tier: 'pro' } },
  },
  { id: 'plain', groups: ['settings2'] },
] as const;

function make(opts: { storage?: StorageAdapter; initialSeen?: InitialSeenOption<(typeof entries)[number]['id']> } = {}) {
  const storage = opts.storage ?? memoryStorage();
  const changelog = createChangelog({ storage, entries, initialSeen: opts.initialSeen ?? 'none' });
  return { changelog, storage };
}

const ids = (list: { id: string }[]) => list.map((e) => e.id);
const stored = (storage: StorageAdapter, key = 'changelog') => JSON.parse(storage.get(key) as string);

/** Lets the write chain flush. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('first launch', () => {
  it("defaults to 'all': nothing is new and the stored record is written", async () => {
    const storage = memoryStorage();
    const changelog = createChangelog({ storage, entries });
    expect(changelog.isReady).toBe(true); // sync adapter: ready immediately
    expect(changelog.getEntries({ isNew: true }).entries).toEqual([]);
    await flush();
    expect(stored(storage)).toEqual({
      schema: 1,
      seen: { 'dark-mode': true, 'fix-sync': true, 'voice-notes': true, plain: true },
    });
  });

  it("'none' makes every entry new", () => {
    const { changelog } = make();
    expect(ids(changelog.getEntries({ isNew: true }).entries)).toEqual(['dark-mode', 'fix-sync', 'voice-notes', 'plain']);
  });

  it('an id list marks only those (unknown ids ignored)', () => {
    const { changelog } = make({ initialSeen: ['fix-sync', 'nope' as 'fix-sync'] });
    expect(ids(changelog.getEntries({ isNew: true }).entries)).toEqual(['dark-mode', 'voice-notes', 'plain']);
  });

  it('runs only once per namespace', async () => {
    const storage = memoryStorage();
    createChangelog({ storage, entries, initialSeen: 'none' });
    await flush();
    const fn = vi.fn(() => 'all' as const);
    const again = createChangelog({ storage, entries, initialSeen: fn });
    expect(fn).not.toHaveBeenCalled();
    expect(again.getEntries({ isNew: true }).entries).toHaveLength(4);
  });

  it('awaits an async initialSeen and stays loading meanwhile', async () => {
    let resolve!: (v: 'none') => void;
    const changelog = createChangelog({
      storage: memoryStorage(),
      entries,
      initialSeen: () => new Promise<'none'>((r) => (resolve = r)),
    });
    expect(changelog.isReady).toBe(false);
    expect(changelog.getEntry('dark-mode').isNew).toBe(false);
    resolve('none');
    await changelog.ready();
    expect(changelog.getEntry('dark-mode').isNew).toBe(true);
  });

  it("falls back to 'all' when initialSeen rejects", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const changelog = createChangelog({ storage: memoryStorage(), entries, initialSeen: () => Promise.reject(new Error('x')) });
    await changelog.ready();
    expect(changelog.getEntries({ isNew: true }).entries).toEqual([]);
    warn.mockRestore();
  });

  it('passes the namespace to initialSeen', async () => {
    const fn = vi.fn((ns: string | null) => (ns === 'old-user' ? ('none' as const) : ('all' as const)));
    const changelog = createChangelog({ storage: memoryStorage(), entries, initialSeen: fn });
    changelog.setNamespace('old-user');
    expect(fn.mock.calls).toEqual([[null], ['old-user']]);
    expect(changelog.getEntries({ isNew: true }).entries).toHaveLength(4);
  });
});

describe('what counts as new', () => {
  it('scoped vs unscoped', () => {
    const { changelog } = make();
    changelog.markSeen('dark-mode', { channel: 'popup' });
    expect(changelog.getEntry('dark-mode', { channel: 'popup' }).isNew).toBe(false);
    expect(changelog.getEntry('dark-mode', { channel: 'badge' }).isNew).toBe(true);
    expect(changelog.getEntry('dark-mode').isNew).toBe(true); // still unseen in badge
    changelog.markSeen('dark-mode', { channel: 'badge' });
    expect(changelog.getEntry('dark-mode').isNew).toBe(false);
  });

  it('entries without channels are excluded from scoped queries and have one seen state', () => {
    const { changelog } = make();
    expect(ids(changelog.getEntries({ channel: 'popup' }).entries)).toEqual(['dark-mode', 'fix-sync']);
    expect(changelog.getEntry('plain').isNew).toBe(true);
    changelog.markSeen('plain');
    expect(changelog.getEntry('plain').isNew).toBe(false);
  });

  it('unscoped markSeen clears every channel', () => {
    const { changelog } = make();
    changelog.markSeen('dark-mode');
    expect(changelog.getEntry('dark-mode', { channel: 'popup' }).isNew).toBe(false);
    expect(changelog.getEntry('dark-mode', { channel: 'badge' }).isNew).toBe(false);
  });

  it('scoped markSeen on an entry not in that channel does nothing', async () => {
    const { changelog, storage } = make();
    // @ts-expect-error fix-sync is not in badge
    changelog.markSeen('fix-sync', { channel: 'badge' });
    expect(changelog.getEntry('fix-sync').isNew).toBe(true);
    await flush();
    expect(stored(storage).seen['fix-sync']).toBeUndefined();
  });
});

describe('useEntries filters', () => {
  it('group matching is hierarchical', () => {
    const { changelog } = make();
    expect(ids(changelog.getEntries({ group: 'settings' }).entries)).toEqual(['dark-mode']);
    expect(ids(changelog.getEntries({ group: 'settings2' }).entries)).toEqual(['plain']);
    expect(ids(changelog.getEntries({ group: 'onboarding' }).entries)).toEqual(['voice-notes']);
    expect(ids(changelog.getEntries({ group: 'settings.appearance' }).entries)).toEqual(['dark-mode']);
    expect(ids(changelog.getEntries({ group: 'settings.appear' }).entries)).toEqual([]);
  });

  it('data matches partially, recursively and strictly', () => {
    const { changelog } = make();
    expect(ids(changelog.getEntries({ data: { audience: 'all' } }).entries)).toEqual(['dark-mode', 'fix-sync']);
    expect(ids(changelog.getEntries({ data: { meta: { tier: 'pro' } } }).entries)).toEqual(['voice-notes']);
    expect(ids(changelog.getEntries({ data: {} }).entries)).toEqual(['dark-mode', 'fix-sync', 'voice-notes']);
  });

  it('isNew filters both ways', () => {
    const { changelog } = make();
    changelog.markSeen('fix-sync');
    expect(ids(changelog.getEntries({ isNew: false }).entries)).toEqual(['fix-sync']);
  });

  it('markAllSeen only touches matched entries, with the query scope', () => {
    const { changelog } = make();
    changelog.getEntries({ channel: 'popup', isNew: true, data: { audience: 'all' } }).markAllSeen();
    expect(changelog.getEntries({ channel: 'popup', isNew: true }).entries).toEqual([]);
    // badge untouched
    expect(ids(changelog.getEntries({ channel: 'badge', isNew: true }).entries)).toEqual(['dark-mode', 'voice-notes']);
  });

  it('preserves config order', () => {
    const { changelog } = make();
    expect(ids(changelog.getEntries().entries)).toEqual(['dark-mode', 'fix-sync', 'voice-notes', 'plain']);
  });
});

describe('stored format and pruning', () => {
  it('scoped writes lists, unscoped writes true, lists never upgrade to true', async () => {
    const { changelog, storage } = make();
    changelog.markSeen('dark-mode', { channel: 'popup' });
    changelog.markSeen('dark-mode', { channel: 'badge' });
    changelog.markSeen('fix-sync');
    changelog.markSeen('fix-sync', { channel: 'popup' }); // stays true
    await flush();
    expect(stored(storage).seen).toEqual({ 'dark-mode': ['popup', 'badge'], 'fix-sync': true });
  });

  it('prunes removed ids and channels on the next write', async () => {
    const storage = memoryStorage({
      changelog: JSON.stringify({
        schema: 1,
        seen: { gone: true, 'dark-mode': ['popup', 'old-channel'] },
      }),
    });
    const changelog = createChangelog({ storage, entries });
    // Not rewritten on load
    expect(stored(storage).seen.gone).toBe(true);
    changelog.markSeen('fix-sync');
    await flush();
    expect(stored(storage).seen).toEqual({ 'dark-mode': ['popup'], 'fix-sync': true });
  });

  it('adding a channel: true stays seen; a list makes the new channel new', () => {
    const storage = memoryStorage({
      changelog: JSON.stringify({ schema: 1, seen: { 'dark-mode': true, 'fix-sync': ['popup'] } }),
    });
    const changelog = createChangelog({
      storage,
      entries: [
        { id: 'dark-mode', channels: ['popup', 'badge', 'tab'] },
        { id: 'fix-sync', channels: ['popup', 'badge'] },
      ],
    });
    expect(changelog.getEntry('dark-mode', { channel: 'tab' }).isNew).toBe(false);
    expect(changelog.getEntry('fix-sync', { channel: 'popup' }).isNew).toBe(false);
    expect(changelog.getEntry('fix-sync', { channel: 'badge' }).isNew).toBe(true);
  });

  it('treats corrupt storage as a first launch', () => {
    const storage = memoryStorage({ changelog: '{not json' });
    const changelog = createChangelog({ storage, entries, initialSeen: 'none' });
    expect(changelog.getEntries({ isNew: true }).entries).toHaveLength(4);
  });

  it('treats IDs named like built-in object properties as ordinary entries', async () => {
    const tricky = ['toString', 'constructor', 'hasOwnProperty', '__proto__'] as const;
    const storage = memoryStorage();
    const changelog = createChangelog({
      storage,
      initialSeen: 'none',
      entries: tricky.map((id) => ({ id, channels: ['popup', 'badge'] })),
    });
    for (const id of tricky) expect(changelog.getEntry(id).isNew).toBe(true);

    changelog.markSeen('toString', { channel: 'popup' });
    changelog.markSeen(['constructor', '__proto__']);
    expect(changelog.getEntry('toString', { channel: 'popup' }).isNew).toBe(false);
    expect(changelog.getEntry('toString', { channel: 'badge' }).isNew).toBe(true);
    expect(changelog.getEntry('constructor').isNew).toBe(false);
    expect(changelog.getEntry('__proto__').isNew).toBe(false);
    expect(changelog.getEntry('hasOwnProperty').isNew).toBe(true);

    // Survives a save and reload.
    await flush();
    const again = createChangelog({ storage, entries: tricky.map((id) => ({ id, channels: ['popup', 'badge'] })) });
    expect(again.getEntry('__proto__').isNew).toBe(false);
    expect(again.getEntry('hasOwnProperty').isNew).toBe(true);
  });

  it('throws on duplicate ids', () => {
    expect(() =>
      createChangelog({ storage: memoryStorage(), entries: [{ id: 'a' }, { id: 'a' }] }),
    ).toThrow(/Duplicate entry id "a"/);
  });

  it('throws when storage is missing or not an adapter', () => {
    const create = (storage: unknown) => () =>
      createChangelog({ storage: storage as StorageAdapter, entries: [{ id: 'a' }] });
    expect(create(undefined)).toThrow(/needs a `storage` adapter/);
    expect(create(null)).toThrow(/needs a `storage` adapter/);
    expect(create({ get: () => null })).toThrow(/needs a `storage` adapter/);
  });
});

describe('loading with async storage', () => {
  function asyncMemory(): StorageAdapter & { gate: () => void } {
    const inner = memoryStorage();
    let open!: () => void;
    const opened = new Promise<void>((r) => (open = r));
    return {
      gate: () => open(),
      get: async (k) => {
        await opened;
        return inner.get(k) as string | null;
      },
      set: async (k, v) => inner.set(k, v),
      remove: async (k) => inner.remove!(k),
    };
  }

  it('reports nothing as new until loaded, then notifies', async () => {
    const storage = asyncMemory();
    const changelog = createChangelog({ storage, entries, initialSeen: 'none' });
    const listener = vi.fn();
    changelog.subscribe(listener);
    expect(changelog.isReady).toBe(false);
    expect(changelog.getEntries({ isNew: true }).entries).toEqual([]);
    storage.gate();
    await changelog.ready();
    expect(listener).toHaveBeenCalled();
    expect(changelog.getEntries({ isNew: true }).entries).toHaveLength(4);
  });

  it('queues markSeen calls made before loading finishes', async () => {
    const storage = asyncMemory();
    const changelog = createChangelog({ storage, entries, initialSeen: 'none' });
    changelog.markSeen('dark-mode');
    storage.gate();
    await changelog.ready();
    expect(changelog.getEntry('dark-mode').isNew).toBe(false);
  });
});

describe('namespaces', () => {
  it('keeps seen state per namespace under separate keys', async () => {
    const { changelog, storage } = make();
    changelog.markSeen('dark-mode');
    changelog.setNamespace('u1');
    expect(changelog.namespace).toBe('u1');
    expect(changelog.getEntry('dark-mode').isNew).toBe(true); // nothing carried over
    changelog.markSeen('fix-sync');
    changelog.setNamespace(null);
    expect(changelog.getEntry('dark-mode').isNew).toBe(false);
    expect(changelog.getEntry('fix-sync').isNew).toBe(true);
    await flush();
    expect(stored(storage, 'changelog:u1').seen['fix-sync']).toBe(true);
  });

  it('setting the active namespace does nothing', () => {
    const { changelog } = make();
    const listener = vi.fn();
    changelog.subscribe(listener);
    changelog.setNamespace(null);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('reset', () => {
  it('clears the current namespace and re-runs first launch', async () => {
    const { changelog, storage } = make();
    changelog.markSeen('dark-mode');
    changelog.setNamespace('other');
    changelog.markSeen('dark-mode');
    changelog.setNamespace(null);
    await changelog.reset();
    expect(changelog.getEntry('dark-mode').isNew).toBe(true);
    await flush();
    expect(stored(storage, 'changelog:other').seen['dark-mode']).toBe(true);
  });

  it('re-runs first launch on adapters without remove()', async () => {
    const inner = memoryStorage();
    const writes: string[] = [];
    const storage: StorageAdapter = {
      get: (k) => inner.get(k),
      set: (k, v) => {
        writes.push(v);
        return inner.set(k, v);
      },
    };
    const { changelog } = make({ storage });
    changelog.markSeen('dark-mode');
    await changelog.reset();
    expect(changelog.getEntry('dark-mode').isNew).toBe(true);
    expect(writes).toContain('');
    // The cleared value itself must read as "nothing stored".
    inner.set('changelog', '');
    const again = createChangelog({ storage, entries, initialSeen: 'all' });
    expect(again.getEntry('dark-mode').isNew).toBe(false);
    expect(again.getEntry('plain').isNew).toBe(false);
  });
});
