import { asyncStorage, createChangelog } from 'react-changelog-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Everything the app wants to announce. Adding an entry here (in a store release or an OTA
 * update) is all it takes: it shows up as new for every user who hasn't seen it.
 */
export const changelog = createChangelog({
  storage: asyncStorage(AsyncStorage),
  // A real app would return 'none' only for people who used the app before adopting the
  // library (see "Adopting it in an existing app" in the README) and keep the default 'all' for fresh installs. The demo uses
  // 'none' so there is something to see on first launch.
  initialSeen: () => 'none',
  entries: [
    {
      id: 'dark-mode',
      channels: ['popup', 'badge'],
      groups: ['settings.appearance'],
      data: { title: 'Dark mode', body: 'Easier on the eyes at night. Settings → Appearance.', emoji: '🌙', audience: 'all' },
    },
    {
      id: 'fix-sync',
      channels: ['popup'],
      data: { title: 'Fixed sync on slow networks', body: 'Notes no longer get stuck on “Saving…”.', emoji: '🛠️', audience: 'all' },
    },
    {
      id: 'voice-notes',
      channels: ['badge'],
      groups: ['editor', 'onboarding.tips'],
      data: { title: 'Voice notes', body: 'Hold the mic button in the editor to record.', emoji: '🎙️', audience: 'all' },
    },
    {
      id: 'ai-summary',
      channels: ['popup', 'badge'],
      groups: ['editor'],
      data: { title: 'AI summaries', body: 'Summarise any note in one tap. Pro only.', emoji: '✨', audience: 'pro' },
    },
    {
      id: 'export-pdf',
      channels: ['badge'],
      groups: ['settings.export'],
      data: { title: 'Export to PDF', body: 'Settings → Export.', emoji: '📄', audience: 'all' },
    },
  ],
});

export type ChangelogEntryId = Parameters<typeof changelog.getEntry>[0];

// Type-checks entry IDs, channels and `data` in useEntry / useEntries.
declare module 'react-changelog-kit' {
  interface Register {
    changelog: typeof changelog;
  }
}
