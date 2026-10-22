import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { theme } from './theme';

export interface TabItem {
  key: string;
  label: string;
  badge?: number;
  icon?: (props: { color: string; size: number }) => React.ReactNode;
}

// Shared bottom tab bar for both apps:
// - Dynamically adjusts height for gesture navigation (thin bar ~16-24dp) vs 3-button navigation (~48dp)
// - Handles screen width and horizontal cutouts across various phone dimensions
export function TabBar({ items, activeKey, onPress }: { items: TabItem[]; activeKey: string; onPress: (key: string) => void }): React.JSX.Element {
  const safeInsets = React.useContext(SafeAreaInsetsContext);
  const insets = safeInsets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { width } = useWindowDimensions();

  // Dynamic bottom clearance:
  // On 3-button navigation, insets.bottom is ~48dp; on gesture navigation it is ~16-24dp; on hardware buttons it is 0.
  const bottomPadding = insets.bottom > 0 ? insets.bottom + 6 : 10;
  const leftPadding = Math.max(insets.left, 6);
  const rightPadding = Math.max(insets.right, 6);

  // Responsive tab sizing for phones with many tabs (e.g. 6 partner tabs) or narrow screen widths:
  const availableWidth = width - leftPadding - rightPadding;
  const isCompact = availableWidth / items.length < 64;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomPadding,
          paddingLeft: leftPadding,
          paddingRight: rightPadding,
        },
      ]}
    >
      {items.map((t) => {
        const on = t.key === activeKey;
        return (
          <Pressable
            key={t.key}
            onPress={() => onPress(t.key)}
            style={[styles.tab, isCompact ? styles.tabCompact : styles.tabStandard, on && styles.tabOn]}
            accessibilityRole="button"
          >
            <View style={styles.iconContainer}>
              {t.icon ? (
                t.icon({ color: on ? '#000000' : '#71717a', size: isCompact ? 20 : 22 })
              ) : null}
              {t.badge ? (
                <View style={[styles.badge, isCompact ? styles.badgeCompact : styles.badgeStandard]}>
                  <Text style={[styles.badgeText, isCompact && styles.badgeTextCompact]}>
                    {t.badge > 9 ? '9+' : t.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                isCompact ? styles.labelCompact : styles.labelStandard,
                on && styles.labelOn,
              ]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    width: '100%',
  },
  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
  },
  tabStandard: {
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
    minHeight: 46,
  },
  tabCompact: {
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 2,
    minHeight: 42,
  },
  tabOn: {
    backgroundColor: '#f4f4f5',
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 22,
  },
  label: {
    color: theme.color.sub,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelStandard: {
    fontSize: 11,
    lineHeight: 14,
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  labelOn: {
    color: theme.color.brandDark,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    borderRadius: 8,
    backgroundColor: theme.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeStandard: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
  },
  badgeCompact: {
    minWidth: 14,
    height: 14,
    paddingHorizontal: 2,
    right: -8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  badgeTextCompact: {
    fontSize: 9,
    lineHeight: 11,
  },
});
