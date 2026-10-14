import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from './theme';

export interface TabItem {
  key: string;
  label: string;
  badge?: number;
}

// Shared bottom tab bar for both apps: active pill + count badges + press
// feedback. One component so tab switching feels identical everywhere.
export function TabBar({ items, activeKey, onPress }: { items: TabItem[]; activeKey: string; onPress: (key: string) => void }): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {items.map((t) => {
        const on = t.key === activeKey;
        return (
          <Pressable key={t.key} onPress={() => onPress(t.key)} style={[styles.tab, on && styles.tabOn]} accessibilityRole="button">
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
            {t.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t.badge > 9 ? '9+' : t.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderColor: theme.color.line, backgroundColor: theme.color.card },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: theme.radius.pill },
  tabOn: { backgroundColor: theme.color.brandSoft },
  label: { color: theme.color.sub, fontWeight: '600', fontSize: 14 },
  labelOn: { color: theme.color.brandDark, fontWeight: '800' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.color.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
