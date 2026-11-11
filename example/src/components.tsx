import { useRef, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEntries } from 'react-changelog-kit';
import { audienceFilter, useApp } from './theme';

export function NewTag() {
  const { colors } = useApp();
  return (
    <View style={[styles.tag, { backgroundColor: colors.newBg }]}>
      <Text style={[styles.tagText, { color: colors.newText }]}>NEW</Text>
    </View>
  );
}

export function Dot() {
  const { colors } = useApp();
  return <View style={[styles.dot, { backgroundColor: colors.dot }]} />;
}

export function Card({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

export function Row({
  title,
  subtitle,
  right,
  isNew,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  isNew?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useApp();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed && onPress ? 0.6 : 1 }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.titleLine}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {isNew ? <NewTag /> : null}
        </View>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary' }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' }) {
  const { colors } = useApp();
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? colors.accent : 'transparent', borderColor: colors.accent, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? '#fff' : colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * Popup on launch: new entries in the `popup` channel. Dismissing marks them seen in `popup`
 * only, so their badges stay until the user visits the feature.
 */
export function WhatsNewSheet() {
  const { colors, isPro } = useApp();
  const { entries, markAllSeen } = useEntries({ channel: 'popup', isNew: true, ...audienceFilter(isPro) });
  // Keep showing the last batch while the modal fades out, instead of an empty sheet.
  const shown = useRef(entries);
  if (entries.length > 0) shown.current = entries;

  return (
    <Modal visible={entries.length > 0} transparent animationType="fade" onRequestClose={markAllSeen}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>What’s new</Text>
          {shown.current.map((e) => (
            <View key={e.id} style={styles.sheetItem}>
              <Text style={styles.emoji}>{e.data.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{e.data.title}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{e.data.body}</Text>
              </View>
            </View>
          ))}
          <Button title="Got it" onPress={markAllSeen} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: -2, right: -6 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  titleLine: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  button: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, width: '100%', maxWidth: 560, alignSelf: 'center' },
  sheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  sheetItem: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  emoji: { fontSize: 24 },
});
