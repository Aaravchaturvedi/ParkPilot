import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, SafeAreaView, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from './theme';

// Standard screen shell: safe area + tinted background + consistent padding.
// Every tab screen should render inside this so spacing/refresh feels uniform.
export function Screen({
  children,
  refreshing,
  onRefresh,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <SafeAreaView style={[styles.safe, style]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentStyle]}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={theme.color.brand} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// Brand header: solid mark + title + subtitle + optional right-side node
// (avatar, status dot, balance). Gives every screen an identity.
export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.header}>
      <View style={styles.mark}>
        <Text style={styles.markText}>P</Text>
      </View>
      <View style={styles.headCol}>
        <Text style={styles.headTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headSub}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.headRight}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  headCol: { flex: 1, gap: 1 },
  headTitle: { fontSize: theme.type.title, fontWeight: '800', color: theme.color.ink },
  headSub: { fontSize: theme.type.small, color: theme.color.sub },
  headRight: { alignItems: 'flex-end' },
});
