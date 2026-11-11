import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { internals } from './changelog.ts';
import type { Internals, Snapshot } from './changelog.ts';
import type {
  Changelog,
  ChangelogState,
  EntriesFilter,
  EntryConfig,
  RegisteredEntry,
  UseEntries,
  UseEntry,
} from './types.ts';

interface ContextValue {
  changelog: Changelog<EntryConfig>;
  store: Internals;
}

const ChangelogContext = createContext<ContextValue | null>(null);

export interface ChangelogProviderProps {
  /** The instance from `createChangelog`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changelog: Changelog<any>;
  children?: ReactNode;
}

export function ChangelogProvider({ changelog, children }: ChangelogProviderProps) {
  const store = internals.get(changelog);
  if (!store) {
    throw new Error('[react-changelog-kit] <ChangelogProvider> needs a `changelog` created with createChangelog().');
  }

  const value = useMemo<ContextValue>(() => ({ changelog, store }), [changelog, store]);
  return <ChangelogContext.Provider value={value}>{children}</ChangelogContext.Provider>;
}

function useContextValue(hook: string): ContextValue {
  const value = useContext(ChangelogContext);
  if (!value) throw new Error(`[react-changelog-kit] ${hook}() must be used inside <ChangelogProvider>.`);
  return value;
}

function useSnapshot(hook: string): { ctx: ContextValue; snap: Snapshot } {
  const ctx = useContextValue(hook);
  const { store } = ctx;
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ctx, snap };
}

function useEntryImpl(id: string, opts?: { channel?: string }) {
  const { ctx, snap } = useSnapshot('useEntry');
  const channel = opts?.channel;
  return useMemo(() => ctx.store.computeEntry(snap, id, channel), [ctx.store, snap, id, channel]);
}

function useEntriesImpl(filter: EntriesFilter = {}) {
  const { ctx, snap } = useSnapshot('useEntries');
  const { channel, group, isNew, data } = filter;
  // `data` is usually an inline object literal; key it by value so the result stays stable.
  const dataKey = data === undefined ? undefined : stableKey(data);
  const result = useMemo(
    () => ctx.store.computeEntries(snap, { channel, group, isNew, data }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.store, snap, channel, group, isNew, dataKey],
  );
  const markAllSeen = useCallback(() => result.markAllSeen(), [result]);
  return useMemo(() => ({ entries: result.entries, markAllSeen }), [result, markAllSeen]);
}

function useChangelogImpl(): ChangelogState<EntryConfig> {
  const { ctx, snap } = useSnapshot('useChangelog');
  const { changelog } = ctx;
  return useMemo(
    () => ({
      isReady: snap.ready,
      namespace: snap.namespace,
      setNamespace: changelog.setNamespace,
      markSeen: changelog.markSeen,
      reset: changelog.reset,
    }),
    [snap.ready, snap.namespace, changelog],
  );
}

/** One entry: `{ id, data, isNew, markSeen }`. Pass `{ channel }` to scope it. */
export const useEntry = useEntryImpl as UseEntry<RegisteredEntry>;

/** Entries matching a filter: `{ entries, markAllSeen }`. */
export const useEntries = useEntriesImpl as UseEntries<RegisteredEntry>;

/** Loading status, the namespace and its setter, `markSeen` and `reset`, for the changelog in the nearest Provider. */
export const useChangelog = useChangelogImpl as unknown as () => ChangelogState<RegisteredEntry>;

function stableKey(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
        : v,
    );
  } catch {
    return String(Math.random()); // unserializable: recompute every render
  }
}
