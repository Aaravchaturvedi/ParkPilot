import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Wallet } from '../../../../packages/types/src';
import { wallet } from '../../../../packages/api/src/index';
import { Card, PriceTag } from '../../../../packages/ui/src';

export function WalletScreen(): React.JSX.Element {
  const [w, setW] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wallet()
      .then(({ wallet: data }) => setW(data))
      .catch(() => setError('Could not load wallet.'));
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Earnings</Text>
      {w ? (
        <Card>
          <PriceTag paise={w.asPartner.earnedPaise} label="Earned" />
          <PriceTag paise={w.asPartner.pendingPaise} label="Pending payout" />
          <Text style={styles.dim}>Payout every 3–4 days via UPI/NEFT (mock).</Text>
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  dim: { color: '#6b7280' },
  error: { color: '#dc2626' },
});
