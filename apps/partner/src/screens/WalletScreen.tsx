import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import type { Wallet } from '../../../../packages/types/src';
import { wallet } from '../../../../packages/api/src/index';
import { Button, Card, PriceTag } from '../../../../packages/ui/src';

export function WalletScreen({ active = true }: { active?: boolean }): React.JSX.Element {
  const [w, setW] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const { wallet: data } = await wallet();
      setW(data);
      setError(null);
    } catch {
      if (!silent) setError('Could not load wallet — pull to retry.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Refetch whenever the tab becomes visible (earnings change after each ride).
  useEffect(() => {
    if (active) void load(true);
  }, [active, load]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(false)} />}
    >
      <Text style={styles.title}>Earnings</Text>
      {w ? (
        <Card>
          <PriceTag paise={w.asPartner.earnedPaise} label="Earned" />
          <PriceTag paise={w.asPartner.pendingPaise} label="Pending payout" />
          <Text style={styles.dim}>Payout every 3–4 days via UPI/NEFT (mock).</Text>
        </Card>
      ) : !error ? (
        <Text style={styles.dim}>Loading…</Text>
      ) : null}
      <Button title="Refresh" onPress={() => load(false)} disabled={loading} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  dim: { color: '#6b7280' },
  error: { color: '#dc2626' },
});
