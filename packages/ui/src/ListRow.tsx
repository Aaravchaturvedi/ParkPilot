import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from './theme';

// Hairline separator for stacked content.
export function Divider(): React.JSX.Element {
  return <View style={styles.line} />;
}

// Canonical tappable row: title + subtitle on the left, value/chevron right.
// Used for space lists, trip history, wallet lines — one look everywhere.
export function ListRow({
  title,
  sub,
  right,
  onPress,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}): React.JSX.Element {
  const body = (
    <>
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={styles.sub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
      {onPress ? <Text style={styles.chev}>›</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return <View style={styles.row}>{body}</View>;
}

// Small uppercase section label: "ACTIVE TRIPS", "PARKING REQUESTS", …
export function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  left: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: theme.color.ink },
  sub: { fontSize: theme.type.small, color: theme.color.sub },
  right: { alignItems: 'flex-end', gap: 2 },
  chev: { fontSize: 22, color: theme.color.faint, fontWeight: '600' },
  section: { fontSize: theme.type.small, fontWeight: '800', color: theme.color.sub, textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
});
