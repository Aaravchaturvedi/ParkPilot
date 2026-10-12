import React from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';

interface Props extends TextInputProps {
  label: string;
}

export function Field({ label, ...rest }: Props): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9ca3af" {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 16, color: '#111827' },
});
