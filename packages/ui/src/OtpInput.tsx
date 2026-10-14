import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Animated } from 'react-native';
import { theme } from './theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
  label?: string;
}

// 4-box OTP entry shared by the customer stop-code and partner start-code
// flows: auto-advance, backspace rewind, and a shake when `error` flips true
// (wrong/expired code) so failures are felt, not just read.
export function OtpInput({ value, onChange, length = 4, error, label }: Props): React.JSX.Element {
  const refs = useRef<Array<TextInput | null>>([]);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [error, shake]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (i: number, ch: string): void => {
    const clean = ch.replace(/[^0-9]/g, '').slice(-1);
    const next = value.split('');
    while (next.length < length) next.push('');
    next[i] = clean;
    onChange(next.join('').slice(0, length));
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => {
              refs.current[i] = r;
            }}
            style={[styles.box, error && styles.boxError, d !== '' && styles.boxFilled]}
            keyboardType="numeric"
            maxLength={1}
            value={d}
            onChangeText={(ch) => setAt(i, ch)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            selectTextOnFocus
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: theme.type.small, fontWeight: '600', color: '#374151' },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  box: {
    width: 56,
    height: 64,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: theme.radius.md,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: theme.color.ink,
    backgroundColor: theme.color.card,
  },
  boxFilled: { borderColor: theme.color.brand, borderWidth: 2 },
  boxError: { borderColor: theme.color.danger, borderWidth: 2 },
});
