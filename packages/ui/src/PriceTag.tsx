import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { paiseToRupees } from '../../types/src';

export function PriceTag({ paise, label }: { paise: number; label?: string }): React.JSX.Element {
  return (
    <View style={styles.row}>
      {label ? <Text style={styles.label}>{label} </Text> : null}
      <Text style={styles.price}>{paiseToRupees(paise)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  label: { color: '#6b7280', fontSize: 14 },
  price: { color: '#111827', fontWeight: '700', fontSize: 18 },
});
