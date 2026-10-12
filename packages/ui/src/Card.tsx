import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8, backgroundColor: '#fff' },
});
