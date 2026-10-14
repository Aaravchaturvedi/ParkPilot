import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: theme.color.line,
    // Soft elevation on both platforms (shadow iOS, elevation Android).
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
