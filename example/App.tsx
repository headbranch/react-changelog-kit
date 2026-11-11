import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChangelogProvider, useEntries } from 'react-changelog-kit';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { changelog } from './src/changelog';
import { Dot, WhatsNewSheet } from './src/components';
import { ChangelogScreen, DebugScreen, EditorScreen, SettingsScreen } from './src/screens';
import { AppContext, audienceFilter, palettes, useApp, type AppState } from './src/theme';

const TABS = [
  { key: 'home', label: 'What’s new', icon: '📰', group: undefined },
  { key: 'editor', label: 'Editor', icon: '✏️', group: 'editor' },
  { key: 'settings', label: 'Settings', icon: '⚙️', group: 'settings' },
  { key: 'debug', label: 'Debug', icon: '🧪', group: undefined },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Tab-bar dot: new `badge` entries in this tab's group. */
function TabIcon({ icon, group }: { icon: string; group: string | undefined }) {
  const { isPro } = useApp();
  const { entries } = useEntries({ channel: 'badge', group, isNew: true, ...audienceFilter(isPro) });
  const show = group !== undefined && entries.length > 0;
  return (
    <View>
      <Text style={styles.tabIcon}>{icon}</Text>
      {show ? <Dot /> : null}
    </View>
  );
}

function Shell() {
  const { colors, dark } = useApp();
  const [tab, setTab] = useState<TabKey>('home');
  const Screen = { home: ChangelogScreen, editor: EditorScreen, settings: SettingsScreen, debug: DebugScreen }[tab];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Screen />
      </ScrollView>
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <TabIcon icon={t.icon} group={t.group} />
            <Text style={[styles.tabLabel, { color: t.key === tab ? colors.accent : colors.muted }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <WhatsNewSheet />
    </SafeAreaView>
  );
}

export default function App() {
  const [dark, setDark] = useState(false);
  const [isPro, setPro] = useState(false);

  const value = useMemo<AppState>(
    () => ({ colors: dark ? palettes.dark : palettes.light, dark, setDark, isPro, setPro }),
    [dark, isPro],
  );

  return (
    <ChangelogProvider changelog={changelog}>
      <AppContext.Provider value={value}>
        <SafeAreaProvider>
          <Shell />
        </SafeAreaProvider>
      </AppContext.Provider>
    </ChangelogProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingTop: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
