/** Where seen state is persisted. Sync adapters (MMKV) make the store ready immediately. */
export interface StorageAdapter {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): void | Promise<void>;
  remove?(key: string): void | Promise<void>;
}

/** One thing to tell users about. Only these four keys are reserved; everything custom goes in `data`. */
export interface EntryConfig {
  readonly id: string;
  readonly channels?: readonly string[];
  readonly groups?: readonly string[];
  readonly data?: unknown;
}

export type InitialSeen<Id extends string = string> = 'all' | 'none' | readonly Id[];

export type InitialSeenOption<Id extends string = string> =
  | InitialSeen<Id>
  | ((namespace: string | null) => InitialSeen<Id> | Promise<InitialSeen<Id>>);

export interface ChangelogOptions<E extends readonly EntryConfig[]> {
  entries: E;
  storage: StorageAdapter;
  initialSeen?: InitialSeenOption<E[number]['id']>;
}

// ---------------------------------------------------------------------------
// Type-level helpers. `E` is always the union of entry configs.
// ---------------------------------------------------------------------------

/** Union of every entry ID. */
export type IdOf<E extends EntryConfig> = E['id'];

/** Union of every channel name used by any entry. */
export type ChannelOf<E extends EntryConfig> = E extends { readonly channels: readonly (infer C)[] }
  ? C & string
  : never;

/** The entry config(s) with this ID. */
export type EntryById<E extends EntryConfig, I> = Extract<E, { readonly id: I }>;

type AnyIn<C, X> = C extends X ? true : never;

/** Entry configs that list channel `C` (any of them, if `C` is a union). */
export type EntryInChannel<E extends EntryConfig, C> = E extends {
  readonly channels: readonly (infer X)[];
}
  ? [AnyIn<C, X>] extends [never]
    ? never
    : E
  : never;

/** IDs of entries that list channel `C`. */
export type IdInChannel<E extends EntryConfig, C> = IdOf<EntryInChannel<E, C>>;

/** The `data` type of an entry config (`undefined` when it has none). */
export type DataOf<E extends EntryConfig> = E extends { readonly data: infer D } ? D : undefined;

/** Deep partial used by the `data` filter. Arrays, functions and other non-plain values are compared by `===`. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends Date | RegExp | Map<unknown, unknown> | Set<unknown>
      ? T
      : T extends object
        ? { readonly [K in keyof T]?: DeepPartial<T[K]> }
        : T;

/** What `useEntry` / `useEntries` return for each entry. */
export interface Entry<Id extends string = string, Data = unknown> {
  id: Id;
  data: Data;
  /** Scoped: not seen in that channel. Unscoped: not seen in at least one of the entry's channels. */
  isNew: boolean;
  /** Scoped: marks that channel. Unscoped: marks every channel. */
  markSeen: () => void;
}

/** Distributes over the config union so `data` narrows when you check `id`. */
export type EntryFor<E extends EntryConfig> = E extends EntryConfig ? Entry<IdOf<E>, DataOf<E>> : never;

export interface EntryOptions<C extends string = string> {
  channel?: C;
}

export interface EntriesFilter<C extends string = string, D = unknown> {
  /** Only entries in this channel; `isNew` and `markSeen` are scoped to it. */
  channel?: C;
  /** Only entries with a group equal to this value or nested under it (`'settings'` matches `'settings.x'`). */
  group?: string;
  /** `true`: only new entries. `false`: only entries that aren't new. Omitted: both. */
  isNew?: boolean;
  /** Only entries whose `data` matches this partial object, by strict equality. */
  data?: DeepPartial<D>;
}

export interface EntriesResult<T> {
  entries: T[];
  /** Marks every entry in this result seen, with the same scope as the query. */
  markAllSeen: () => void;
}

/** Entries returned for a query on channel `C` (all entries when unscoped). */
type ResultEntry<E extends EntryConfig, C> = [C] extends [string]
  ? string extends C
    ? EntryFor<E>
    : EntryFor<EntryInChannel<E, C>>
  : EntryFor<E>;

type FilterData<E extends EntryConfig> = Exclude<DataOf<E>, undefined>;

/** `data` for an ID. Falls back to every entry's `data` when IDs are plain strings (no `Register`). */
type DataById<E extends EntryConfig, I> = string extends IdOf<E> ? DataOf<E> : DataOf<EntryById<E, I>>;

type EntriesQuery<E extends EntryConfig, C> = EntriesFilter<NonNullable<C> & ChannelOf<E>, FilterData<E>> & {
  channel?: C;
};

/** A changelog instance. Pass it to `<ChangelogProvider>`; use it directly outside React. */
export interface Changelog<E extends EntryConfig> {
  /** Marks entries seen. Unscoped marks every channel (including ones added later). */
  markSeen(id: IdOf<E> | readonly IdOf<E>[], options?: { channel?: undefined }): void;
  /** Marks entries seen in one channel only. */
  markSeen<C extends ChannelOf<E>>(id: IdInChannel<E, C> | readonly IdInChannel<E, C>[], options: { channel: C }): void;

  /**
   * Switches to a separate set of seen state, such as a user, workspace or profile ID. Starts as `null`,
   * which is shared across the device. Hooks re-render, and nothing reports as new until it has loaded.
   */
  setNamespace(namespace: string | null): void;
  /** Clears stored state for the current namespace and re-runs first-launch rules. */
  reset(): Promise<void>;

  // Non-hook access, for use outside React and in tests.
  getEntry<I extends IdOf<E>>(id: I, options?: EntryOptions<ChannelOf<E>>): Entry<I, DataById<E, I>>;
  getEntries<C extends ChannelOf<E> | undefined = undefined>(
    filter?: EntriesQuery<E, C>,
  ): EntriesResult<ResultEntry<E, C>>;
  /** Subscribe to any change in seen state or loading status. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** `false` while storage is loading (every entry reports `isNew: false` until then). */
  readonly isReady: boolean;
  /** Which set of seen state is in use. Change it with `setNamespace`. */
  readonly namespace: string | null;
  /** Resolves once the current namespace has finished loading. */
  ready(): Promise<void>;
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/**
 * Register your changelog to type-check entry IDs, channels and `data` in the hooks:
 *
 * ```ts
 * declare module 'react-changelog-kit' {
 *   interface Register {
 *     changelog: typeof changelog;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Register {}

/** What the hooks assume when nothing is registered: any ID, any channel, untyped `data`. */
export interface UnregisteredEntry {
  readonly id: string;
  readonly channels: readonly string[];
  readonly groups?: readonly string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data: any;
}

/** The entry config union of the registered changelog, or `UnregisteredEntry`. */
export type RegisteredEntry = Register extends { changelog: Changelog<infer E> } ? E : UnregisteredEntry;

export interface UseEntry<E extends EntryConfig> {
  /** One entry, unscoped. */
  <I extends IdOf<E>>(id: I, options?: { channel?: undefined }): Entry<I, DataById<E, I>>;
  /** One entry, scoped to a channel. Only IDs of entries in that channel are accepted. */
  <C extends ChannelOf<E>, I extends IdInChannel<E, C>>(id: I, options: { channel: C }): Entry<I, DataById<E, I>>;
}

export interface UseEntries<E extends EntryConfig> {
  <C extends ChannelOf<E> | undefined = undefined>(filter?: EntriesQuery<E, C>): EntriesResult<ResultEntry<E, C>>;
}

/** What `useChangelog()` returns. Re-renders when loading status or namespace changes. */
export interface ChangelogState<E extends EntryConfig> {
  /** `false` while storage is loading. */
  isReady: boolean;
  /** Which set of seen state is in use. */
  namespace: string | null;
  setNamespace: Changelog<E>['setNamespace'];
  markSeen: Changelog<E>['markSeen'];
  /** Clears stored state for the current namespace and re-runs first-launch rules. */
  reset(): Promise<void>;
}
