import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { useChangelog, useEntries, useEntry } from 'react-changelog-kit';
import { changelog } from './changelog';
import { Button, Card, Row } from './components';
import { audienceFilter, useApp } from './theme';

function Heading({ children }: { children: string }) {
  const { colors } = useApp();
  return <Text style={[styles.heading, { color: colors.muted }]}>{children}</Text>;
}

/** Full changelog: every entry, unscoped. Tapping one marks it seen everywhere. */
export function ChangelogScreen() {
  const { isPro } = useApp();
  const { entries, markAllSeen } = useEntries(audienceFilter(isPro));
  const newCount = entries.filter((e) => e.isNew).length;
  return (
    <View>
      <Heading>{`Changelog · ${newCount} new`}</Heading>
      <Card>
        {entries.map((e) => (
          <Row key={e.id} title={`${e.data.emoji}  ${e.data.title}`} subtitle={e.data.body} isNew={e.isNew} onPress={e.markSeen} />
        ))}
      </Card>
      {newCount > 0 ? <Button kind="ghost" title="Mark all as seen" onPress={markAllSeen} /> : null}
    </View>
  );
}

/** NEW tags on the features themselves. Using a feature marks it seen (unscoped). */
export function EditorScreen() {
  const { isPro } = useApp();
  const voice = useEntry('voice-notes');
  const ai = useEntry('ai-summary');
  const [log, setLog] = useState('Try the tools below.');
  return (
    <View>
      <Heading>Editor</Heading>
      <Card>
        <Row
          title="🎙️  Record voice note"
          subtitle="Using it clears its badge."
          isNew={voice.isNew}
          onPress={() => {
            voice.markSeen();
            setLog('Recording… (pretend)');
          }}
        />
        {isPro ? (
          <Row
            title="✨  Summarise note"
            subtitle="Pro feature"
            isNew={ai.isNew}
            onPress={() => {
              ai.markSeen();
              setLog('Summary: a very important note.');
            }}
          />
        ) : (
          <Row title="✨  Summarise note" subtitle="Upgrade to Pro on the Debug tab" />
        )}
      </Card>
      <Text style={{ color: useApp().colors.muted }}>{log}</Text>
    </View>
  );
}

export function SettingsScreen() {
  const { dark, setDark, colors } = useApp();
  const darkMode = useEntry('dark-mode');
  const exportPdf = useEntry('export-pdf');
  return (
    <View>
      <Heading>Appearance</Heading>
      <Card>
        <Row
          title="Dark mode"
          isNew={darkMode.isNew}
          right={
            <Switch
              value={dark}
              trackColor={{ true: colors.accent }}
              onValueChange={(v) => {
                darkMode.markSeen();
                setDark(v);
              }}
            />
          }
        />
      </Card>
      <Heading>Export</Heading>
      <Card>
        <Row title="Export to PDF" subtitle="Tap to export" isNew={exportPdf.isNew} onPress={exportPdf.markSeen} />
      </Card>
    </View>
  );
}

/** A namespace can be anything with its own seen state: a user, a workspace, a profile. */
const NAMESPACES = [null, 'alice', 'bob'] as const;

/** Namespaces, the pro filter, reset, and the raw stored JSON. */
export function DebugScreen() {
  const { isPro, setPro, colors } = useApp();
  const { namespace, setNamespace, reset } = useChangelog();
  const [raw, setRaw] = useState<string>('');

  useEffect(() => {
    const key = namespace === null ? 'changelog' : `changelog:${namespace}`;
    const refresh = () => {
      // Let the library's write land before reading it back.
      setTimeout(() => {
        AsyncStorage.getItem(key).then((v) => setRaw(v ? JSON.stringify(JSON.parse(v), null, 2) : '(nothing stored)'));
      }, 50);
    };
    refresh();
    return changelog.subscribe(refresh);
  }, [namespace]);

  return (
    <View>
      <Heading>Namespace (separate seen state)</Heading>
      <View style={styles.segment}>
        {NAMESPACES.map((ns) => (
          <Button key={String(ns)} kind={ns === namespace ? 'primary' : 'ghost'} title={ns ?? 'Guest'} onPress={() => setNamespace(ns)} />
        ))}
      </View>
      <Card>
        <Row title="Pro subscription" subtitle="Pro users also see ‘AI summaries’" right={<Switch value={isPro} trackColor={{ true: colors.accent }} onValueChange={setPro} />} />
      </Card>
      <Button kind="ghost" title={`Reset seen state for ${namespace ?? 'Guest'}`} onPress={() => reset()} />
      <Heading>{`Stored: ${namespace === null ? 'changelog' : `changelog:${namespace}`}`}</Heading>
      <Card>
        <Text style={[styles.code, { color: colors.text }]}>{raw}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 8 },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  code: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 12, padding: 16 },
});
