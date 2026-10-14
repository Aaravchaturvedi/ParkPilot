import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from './theme';

const PALETTE = ['#4f46e5', '#0d9488', '#c026d3', '#ea580c', '#0284c7', '#65a30d'];

export function Avatar({ name, size = 56 }: { name: string; size?: number }): React.JSX.Element {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % PALETTE.length;
  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: PALETTE[hash] }]}>
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '800' },
});

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): React.JSX.Element {
  return (
    <View style={s.wrap}>
      <Text style={s.value}>{value}</Text>
      <Text style={s.label}>{label}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8 },
  value: { fontSize: 20, fontWeight: '800', color: theme.color.ink },
  label: { fontSize: theme.type.small, color: theme.color.sub, fontWeight: '600' },
  sub: { fontSize: theme.type.tiny, color: theme.color.faint },
});
