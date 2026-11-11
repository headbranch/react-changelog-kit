// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChangelogProvider, createChangelog, useChangelog, useEntries, useEntry } from '../index.ts';
import { memoryStorage } from './memory-storage.ts';

const make = () =>
  createChangelog({
    storage: memoryStorage(),
    initialSeen: 'none',
    entries: [
      { id: 'dark-mode', channels: ['popup', 'badge'], groups: ['settings'], data: { title: 'Dark mode' } },
      { id: 'fix-sync', channels: ['popup'], data: { title: 'Fixed sync' } },
    ],
  });

type Changelog = ReturnType<typeof make>;

function wrapper(changelog: Changelog) {
  return ({ children }: { children: ReactNode }) => (
    <ChangelogProvider changelog={changelog}>{children}</ChangelogProvider>
  );
}

describe('hooks', () => {
  it('useEntry re-renders when markSeen is called anywhere', () => {
    const changelog = make();
    const { result } = renderHook(() => useEntry('dark-mode'), { wrapper: wrapper(changelog) });
    expect(result.current.isNew).toBe(true);
    expect(result.current.data.title).toBe('Dark mode');
    act(() => changelog.markSeen('dark-mode'));
    expect(result.current.isNew).toBe(false);
  });

  it('popup dismissal leaves the badge', () => {
    const changelog = make();
    const popup = renderHook(() => useEntries({ channel: 'popup', isNew: true }), { wrapper: wrapper(changelog) });
    const badge = renderHook(() => useEntries({ channel: 'badge', group: 'settings', isNew: true }), {
      wrapper: wrapper(changelog),
    });
    expect(popup.result.current.entries.map((e) => e.id)).toEqual(['dark-mode', 'fix-sync']);
    act(() => popup.result.current.markAllSeen());
    expect(popup.result.current.entries).toEqual([]);
    expect(badge.result.current.entries.map((e) => e.id)).toEqual(['dark-mode']);
  });

  it('keeps a stable result across re-renders with inline data filters', () => {
    const changelog = make();
    const { result, rerender } = renderHook(() => useEntries({ data: { title: 'Dark mode' } }), {
      wrapper: wrapper(changelog),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('throws a clear error outside the Provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useEntry('dark-mode'))).toThrow(/must be used inside <ChangelogProvider>/);
    error.mockRestore();
  });

  it('rejects a changelog not made by createChangelog', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = { markSeen() {} } as unknown as Changelog;
    expect(() => renderHook(() => useEntries(), { wrapper: wrapper(fake) })).toThrow(/created with createChangelog/);
    error.mockRestore();
  });
});

describe('namespace', () => {
  it('setNamespace from useChangelog switches seen state on the fly', () => {
    const changelog = make();
    const { result } = renderHook(
      () => ({ state: useChangelog(), entry: useEntry('fix-sync', { channel: 'popup' }) }),
      { wrapper: wrapper(changelog) },
    );
    expect(result.current.state.namespace).toBeNull();
    act(() => result.current.entry.markSeen());
    expect(result.current.entry.isNew).toBe(false);

    act(() => result.current.state.setNamespace('workspace-1'));
    expect(result.current.state.namespace).toBe('workspace-1');
    expect(changelog.namespace).toBe('workspace-1');
    expect(result.current.entry.isNew).toBe(true);

    act(() => result.current.state.setNamespace(null));
    expect(result.current.entry.isNew).toBe(false);
  });

  it('hooks follow changelog.setNamespace called outside React', () => {
    const changelog = make();
    changelog.markSeen('dark-mode');
    const { result } = renderHook(() => useEntry('dark-mode'), { wrapper: wrapper(changelog) });
    expect(result.current.isNew).toBe(false);
    act(() => changelog.setNamespace('profile-2'));
    expect(result.current.isNew).toBe(true);
  });

  it('useChangelog re-renders on readiness and exposes reset', async () => {
    const changelog = make();
    const { result } = renderHook(() => ({ state: useChangelog(), entry: useEntry('dark-mode') }), {
      wrapper: wrapper(changelog),
    });
    expect(result.current.state.isReady).toBe(true);
    act(() => result.current.state.markSeen('dark-mode'));
    expect(result.current.entry.isNew).toBe(false);
    await act(() => result.current.state.reset());
    expect(result.current.entry.isNew).toBe(true);
  });
});
