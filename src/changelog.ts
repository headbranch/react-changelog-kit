import { matchesData, matchesGroup } from './match.ts';
import type {
  Changelog,
  ChangelogOptions,
  EntriesFilter,
  EntriesResult,
  Entry,
  EntryConfig,
  InitialSeen,
  StorageAdapter,
} from './types.ts';

/** Seen state for one entry: `true` = everywhere, list = these channels only, missing = nowhere. */
type SeenValue = true | string[];
type SeenMap = Record<string, SeenValue>;

/**
 * Seen maps are keyed by entry ID, so they have no prototype: a plain `{}` would make IDs like
 * `toString`, `constructor` or `__proto__` read or write built-in properties instead of seen state.
 */
function emptySeen(): SeenMap {
  return Object.create(null) as SeenMap;
}

function copySeen(seen: Readonly<SeenMap>): SeenMap {
  return Object.assign(emptySeen(), seen);
}

interface StoredState {
  schema: 1;
  seen: SeenMap;
}

export interface Snapshot {
  readonly ready: boolean;
  readonly namespace: string | null;
  readonly seen: Readonly<SeenMap>;
}

type PendingOp = { ids: string[]; channel: string | undefined };

const SCHEMA = 1;
const BASE_KEY = 'changelog';

export function storageKey(namespace: string | null): string {
  return namespace === null ? BASE_KEY : `${BASE_KEY}:${namespace}`;
}

/** What the React bindings need from an instance. Kept off the public object. */
export interface Internals {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Snapshot;
  computeEntry(snap: Snapshot, id: string, channel: string | undefined): Entry;
  computeEntries(snap: Snapshot, filter?: EntriesFilter): EntriesResult<Entry>;
}

export const internals = new WeakMap<object, Internals>();

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === 'object' && value !== null && typeof (value as PromiseLike<T>).then === 'function'
  );
}

/** Runs `fn` synchronously when `value` isn't a promise, so sync adapters are ready immediately. */
function then<T, R>(value: T | PromiseLike<T>, fn: (v: T) => R | PromiseLike<R>): R | PromiseLike<R> {
  return isPromiseLike<T>(value) ? value.then(fn) : fn(value);
}

function parseStored(raw: string | null | undefined): StoredState | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.schema !== SCHEMA) return null;
    const seen = emptySeen();
    if (parsed.seen && typeof parsed.seen === 'object') {
      for (const [id, value] of Object.entries(parsed.seen)) {
        if (value === true) seen[id] = true;
        else if (Array.isArray(value)) seen[id] = value.filter((c): c is string => typeof c === 'string');
      }
    }
    return { schema: SCHEMA, seen };
  } catch {
    return null;
  }
}

export function createChangelog<const E extends readonly EntryConfig[]>(
  options: ChangelogOptions<E>,
): Changelog<E[number]> {
  type Config = E[number];
  const { storage, initialSeen = 'all' } = options;
  if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
    throw new Error(
      '[react-changelog-kit] createChangelog needs a `storage` adapter, e.g. mmkvStorage(createMMKV()), ' +
        'asyncStorage(AsyncStorage) or webStorage(localStorage).',
    );
  }
  const configs: readonly Config[] = options.entries;

  const byId = new Map<string, Config>();
  for (const entry of configs) {
    if (byId.has(entry.id)) {
      throw new Error(`[react-changelog-kit] Duplicate entry id "${entry.id}".`);
    }
    byId.set(entry.id, entry);
  }

  // ---------------------------------------------------------------------------
  // Store
  // ---------------------------------------------------------------------------

  let snapshot: Snapshot = { ready: false, namespace: null, seen: emptySeen() };
  const listeners = new Set<() => void>();
  let loadToken = 0;
  let pending: PendingOp[] = [];
  let readyWaiters: Array<() => void> = [];
  let writeChain: Promise<void> = Promise.resolve();
  const unflushed = new Map<string, string>();

  function emit(next: Snapshot) {
    snapshot = next;
    if (next.ready) {
      const waiters = readyWaiters;
      readyWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
    listeners.forEach((listener) => listener());
  }

  function warn(message: string, error: unknown) {
    // eslint-disable-next-line no-console
    console.warn(`[react-changelog-kit] ${message}`, error);
  }

  /** Drops state for IDs no longer in `entries` and channels no longer on an entry. */
  function prune(seen: Readonly<SeenMap>): SeenMap {
    const out = emptySeen();
    for (const [id, value] of Object.entries(seen)) {
      const entry = byId.get(id);
      if (!entry) continue;
      if (value === true) {
        out[id] = true;
        continue;
      }
      const channels = entry.channels ?? [];
      const kept = value.filter((c) => channels.includes(c));
      if (kept.length) out[id] = kept;
    }
    return out;
  }

  function persist(namespace: string | null, seen: Readonly<SeenMap>) {
    const state: StoredState = { schema: SCHEMA, seen: prune(seen) };
    const json = JSON.stringify(state);
    const key = storageKey(namespace);
    // Reads check this first, so switching namespace back and forth never sees a stale value.
    unflushed.set(key, json);
    // Chain writes so async adapters can't apply them out of order.
    writeChain = writeChain
      .then(() => storage.set(key, json))
      .catch((error) => warn('Failed to write seen state.', error))
      .then(() => {
        if (unflushed.get(key) === json) unflushed.delete(key);
      });
  }

  function read(key: string) {
    const cached = unflushed.get(key);
    return cached !== undefined ? cached : storage.get(key);
  }

  /** Pure: returns the new seen map, or the same object if nothing changed. */
  function applyMarkSeen(seen: Readonly<SeenMap>, ids: readonly string[], channel?: string): Readonly<SeenMap> {
    let next: SeenMap | null = null;
    for (const id of ids) {
      const entry = byId.get(id);
      if (!entry) continue;
      const current = (next ?? seen)[id];
      if (channel === undefined) {
        if (current === true) continue;
        next ??= copySeen(seen);
        next[id] = true;
      } else {
        if (!entry.channels?.includes(channel)) continue;
        if (current === true || current?.includes(channel)) continue;
        next ??= copySeen(seen);
        next[id] = current ? [...current, channel] : [channel];
      }
    }
    return next ?? seen;
  }

  function resolveInitialSeen(namespace: string | null): InitialSeen | PromiseLike<InitialSeen> {
    if (typeof initialSeen !== 'function') return initialSeen;
    try {
      const result = initialSeen(namespace);
      return isPromiseLike<InitialSeen>(result)
        ? Promise.resolve(result).catch((error: unknown) => {
            warn('initialSeen rejected; falling back to "all".', error);
            return 'all' as const;
          })
        : result;
    } catch (error) {
      warn('initialSeen threw; falling back to "all".', error);
      return 'all';
    }
  }

  function firstLaunchSeen(value: InitialSeen): SeenMap {
    const seen = emptySeen();
    const ids = value === 'all' ? configs.map((e) => e.id) : value === 'none' ? [] : value;
    for (const id of ids) if (byId.has(id)) seen[id] = true;
    return seen;
  }

  function finishLoad(token: number, namespace: string | null, seen: Readonly<SeenMap>, mustPersist: boolean) {
    if (token !== loadToken) return;
    let next = seen;
    for (const op of pending) next = applyMarkSeen(next, op.ids, op.channel);
    const hadPending = pending.length > 0;
    pending = [];
    if (mustPersist || hadPending) persist(namespace, next);
    emit({ ready: true, namespace, seen: next });
  }

  function load(namespace: string | null): void | PromiseLike<void> {
    const token = ++loadToken;
    const onError = (error: unknown) => {
      if (token !== loadToken) return;
      warn('Failed to load seen state; treating every entry as seen.', error);
      // Fail closed: never spam users with popups because storage broke.
      emit({ ready: true, namespace, seen: firstLaunchSeen('all') });
    };

    try {
      const result = then(read(storageKey(namespace)), (raw) => {
        if (token !== loadToken) return;
        // A valid stored record means first-launch rules already ran for this namespace.
        const stored = parseStored(raw);
        if (stored) {
          finishLoad(token, namespace, stored.seen, false);
          return;
        }
        return then(resolveInitialSeen(namespace), (value) => {
          finishLoad(token, namespace, firstLaunchSeen(value), true);
        });
      });
      if (isPromiseLike(result)) return Promise.resolve(result).catch(onError);
    } catch (error) {
      onError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  function isNewIn(snap: Snapshot, entry: Config, channel: string | undefined): boolean {
    if (!snap.ready) return false;
    const value = snap.seen[entry.id];
    if (value === true) return false;
    if (channel !== undefined) return !value?.includes(channel);
    const channels = entry.channels ?? [];
    // No channels: a single seen state, which only `true` satisfies.
    if (channels.length === 0) return true;
    return channels.some((c) => !value?.includes(c));
  }

  function inChannel(entry: Config, channel: string | undefined): boolean {
    return channel === undefined || (entry.channels?.includes(channel) ?? false);
  }

  function markSeen(id: string | readonly string[], opts?: { channel?: string }): void {
    const ids = typeof id === 'string' ? [id] : [...id];
    const channel = opts?.channel;
    if (!snapshot.ready) {
      // Apply once the namespace has loaded, so we never overwrite state we haven't read.
      pending.push({ ids, channel });
      return;
    }
    const next = applyMarkSeen(snapshot.seen, ids, channel);
    if (next === snapshot.seen) return;
    persist(snapshot.namespace, next);
    emit({ ...snapshot, seen: next });
  }

  function buildEntry(snap: Snapshot, entry: Config, channel: string | undefined): Entry {
    return {
      id: entry.id,
      data: entry.data,
      isNew: isNewIn(snap, entry, channel),
      markSeen: () => markSeen(entry.id, { channel }),
    };
  }

  function computeEntry(snap: Snapshot, id: string, channel: string | undefined): Entry {
    const entry = byId.get(id);
    if (!entry) throw new Error(`[react-changelog-kit] Unknown entry id "${id}".`);
    return buildEntry(snap, entry, channel);
  }

  function computeEntries(snap: Snapshot, filter: EntriesFilter = {}): EntriesResult<Entry> {
    const { channel, group, isNew, data } = filter;
    const entries: Entry[] = [];
    for (const config of configs) {
      if (!inChannel(config, channel)) continue;
      if (group !== undefined && !matchesGroup(config.groups, group)) continue;
      if (data !== undefined && !matchesData(config.data, data)) continue;
      const entry = buildEntry(snap, config, channel);
      if (isNew !== undefined && entry.isNew !== isNew) continue;
      entries.push(entry);
    }
    const ids = entries.map((e) => e.id);
    return { entries, markAllSeen: () => markSeen(ids, { channel }) };
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // Namespace & reset
  // ---------------------------------------------------------------------------

  function setNamespace(namespace: string | null): void {
    if (namespace === snapshot.namespace) return;
    pending = [];
    emit({ ready: false, namespace, seen: emptySeen() });
    load(namespace);
  }

  async function reset(): Promise<void> {
    const namespace = snapshot.namespace;
    const key = storageKey(namespace);
    pending = [];
    loadToken++; // cancel any in-flight load
    emit({ ready: false, namespace, seen: emptySeen() });
    await writeChain;
    unflushed.delete(key);
    try {
      if (storage.remove) await storage.remove(key);
      // No remove(): write a value parseStored rejects, which load treats as "nothing stored".
      else await storage.set(key, '');
    } catch (error) {
      warn('Failed to clear seen state.', error);
    }
    if (snapshot.namespace === namespace) await load(namespace);
  }

  function ready(): Promise<void> {
    if (snapshot.ready) return Promise.resolve();
    return new Promise((resolve) => readyWaiters.push(resolve));
  }

  load(snapshot.namespace);

  const changelog = {
    markSeen,
    setNamespace,
    reset,
    getEntry: (id: string, opts?: { channel?: string }) => computeEntry(snapshot, id, opts?.channel),
    getEntries: (filter?: EntriesFilter) => computeEntries(snapshot, filter),
    subscribe,
    ready,
    get isReady() {
      return snapshot.ready;
    },
    get namespace() {
      return snapshot.namespace;
    },
  };

  internals.set(changelog, {
    subscribe,
    getSnapshot: () => snapshot,
    computeEntry,
    computeEntries,
  });

  // The implementation is loosely typed; the public surface is the fully inferred `Changelog` type.
  return changelog as unknown as Changelog<Config>;
}

export type { StorageAdapter };
