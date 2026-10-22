import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { theme } from './theme';

// Context to coordinate top safe-area insets between parent shells and screens.
// For example, when a parent shell renders its own top status bar header,
// child screens can skip their top inset to prevent double-padding.
export const ScreenInsetsContext = React.createContext<{ noTopInset?: boolean }>({});

export interface ScreenProps {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
}

// Standard screen shell: dynamic safe area + tinted background + consistent padding.
// Handles status bar, camera cutouts, and bottom navigation bar differences dynamically.
export function Screen({
  children,
  refreshing,
  onRefresh,
  style,
  contentStyle,
  edges,
}: ScreenProps): React.JSX.Element {
  const { noTopInset } = React.useContext(ScreenInsetsContext);
  // Default to handling top notification bar and horizontal cutouts.
  // Bottom inset is handled by TabBar (or explicitly passed if full-screen modal).
  const resolvedEdges: readonly Edge[] = edges ?? (noTopInset ? ['left', 'right'] : ['top', 'left', 'right']);

  return (
    <SafeAreaView edges={resolvedEdges} style={[styles.safe, style]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={theme.color.brand} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// Brand header: responsive row with text truncating gracefully on narrower screen dimensions.
export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.header}>
      <View style={styles.headCol}>
        <Text style={styles.headTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
        {subtitle ? <Text style={styles.headSub} numberOfLines={1} ellipsizeMode="tail">{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.headRight}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg, width: '100%' },
  scroll: { flex: 1, width: '100%' },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, width: '100%' },
  headCol: { flex: 1, gap: 1, minWidth: 0 },
  headTitle: { fontSize: theme.type.title, fontWeight: '800', color: theme.color.ink },
  headSub: { fontSize: theme.type.small, color: theme.color.sub },
  headRight: { alignItems: 'flex-end', flexShrink: 0 },
});
