// Compile-time checks for the public types. Run by `npm run typecheck`; the runtime test only keeps vitest happy.
import { expectTypeOf, it } from 'vitest';
import { createChangelog, useChangelog, useEntries, useEntry } from '../index.ts';
import { memoryStorage } from './memory-storage.ts';

const changelog = createChangelog({
  storage: memoryStorage(),
  entries: [
    { id: 'dark-mode', channels: ['popup', 'badge'], groups: ['settings.appearance'], data: { title: 'Dark mode' } },
    { id: 'fix-sync', channels: ['popup'], data: { title: 'Fixed sync', type: 'fix' } },
    { id: 'voice-notes', channels: ['badge'], data: { title: 'Voice notes', proOnly: true } },
    { id: 'no-data' },
  ],
});

// Opt-in typing for the hooks. Applies to the whole program, so every test file sees these entries.
declare module '../index.ts' {
  interface Register {
    changelog: typeof changelog;
  }
}

function typeChecks() {
  // IDs are a literal union
  useEntry('dark-mode');
  // @ts-expect-error typo in id
  useEntry('dark-mdoe');

  // Channel names are inferred
  useEntries({ channel: 'popup' });
  // @ts-expect-error typo in channel
  useEntries({ channel: 'pupop' });

  // Scoped calls only accept IDs in that channel
  useEntry('fix-sync', { channel: 'popup' });
  // @ts-expect-error fix-sync is not in badge
  useEntry('fix-sync', { channel: 'badge' });
  changelog.markSeen(['dark-mode', 'voice-notes'], { channel: 'badge' });
  // @ts-expect-error fix-sync is not in badge
  changelog.markSeen(['dark-mode', 'fix-sync'], { channel: 'badge' });

  // data is inferred per entry
  expectTypeOf(useEntry('fix-sync').data.type).toEqualTypeOf<'fix'>();
  expectTypeOf(useEntry('no-data').data).toEqualTypeOf<undefined>();

  // useEntries returns a union that narrows on id
  const { entries } = useEntries({ channel: 'badge' });
  for (const e of entries) {
    expectTypeOf(e.id).toEqualTypeOf<'dark-mode' | 'voice-notes'>();
    if (e.id === 'voice-notes') expectTypeOf(e.data.proOnly).toEqualTypeOf<true>();
  }

  // data filter is a deep partial of the data union
  useEntries({ data: { proOnly: true } });
  useEntries({ data: { type: 'fix' } });
  // @ts-expect-error unknown key
  useEntries({ data: { porOnly: true } });

  // initialSeen only takes known IDs
  createChangelog({
    storage: memoryStorage(),
    entries: [{ id: 'a' }, { id: 'b' }],
    initialSeen: ['a'],
  });
  createChangelog({
    storage: memoryStorage(),
    entries: [{ id: 'a' }, { id: 'b' }],
    // @ts-expect-error unknown id
    initialSeen: ['c'],
  });

  // The instance is typed on its own, no Register needed
  changelog.getEntry('dark-mode');
  // @ts-expect-error typo in id
  changelog.getEntry('dark-mdoe');

  // useChangelog().markSeen is typed too
  useChangelog().markSeen('fix-sync', { channel: 'popup' });
  // @ts-expect-error fix-sync is not in badge
  useChangelog().markSeen('fix-sync', { channel: 'badge' });

  // An app with no channels never has to mention them
  const plain = createChangelog({ storage: memoryStorage(), entries: [{ id: 'x', groups: ['settings'] }] });
  plain.getEntry('x');
  plain.getEntries({ group: 'settings', isNew: true });
}

it('type checks compile', () => {
  void typeChecks;
});
