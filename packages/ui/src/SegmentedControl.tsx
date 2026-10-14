import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from './theme';

export interface Segment<T extends string | number> {
  value: T;
  label: string;
}

// One consistent pill switch for radius pickers, distance filters, and any
// future toggle — replaces the ad-hoc Pressable chip rows per screen.
export function SegmentedControl<T extends string | number>({ options, value, onChange }: { options: Segment<T>[]; value: T; onChange: (v: T) => void }): React.JSX.Element {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.opt, on && styles.on]} accessibilityRole="button">
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  opt: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: theme.radius.pill, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: theme.color.card },
  on: { borderColor: theme.color.brand, backgroundColor: theme.color.brand },
  text: { color: theme.color.sub, fontWeight: '600', fontSize: 14 },
  textOn: { color: '#fff', fontWeight: '700' },
});
