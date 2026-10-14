import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { theme } from './theme';

interface Props extends TextInputProps {
  label: string;
}

export function Field({ label, style, ...rest }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, focused && styles.focused, style]}
        placeholderTextColor={theme.color.faint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: theme.type.small, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: theme.radius.md, padding: 12, fontSize: 16, color: theme.color.ink, backgroundColor: theme.color.card },
  focused: { borderColor: theme.color.brand, borderWidth: 2, padding: 11 },
});
