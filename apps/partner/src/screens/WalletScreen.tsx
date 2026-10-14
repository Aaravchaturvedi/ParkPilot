import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Wallet } from '../../../../packages/types/src';
import { wallet } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, Screen, SectionLabel, SkeletonBlock, Stat } from '../../../../packages/ui/src';

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
    <Screen refreshing={loading} onRefresh={() => load(false)}>
      <AppHeader title="Earnings" subtitle="Payout every 3–4 days · UPI/NEFT (mock)" />
      {w ? (
        <>
          <Card style={styles.hero}>
            <Text style={styles.kicker}>Total earned</Text>
            <Text style={styles.balance}>₹{(w.asPartner.earnedPaise / 100).toFixed(0)}</Text>
            <View style={styles.split}>
              <Stat label="Pending payout" value={`₹${(w.asPartner.pendingPaise / 100).toFixed(0)}`} />
            </View>
          </Card>
          <Button title="Refresh" variant="secondary" onPress={() => load(false)} disabled={loading} />
        </>
      ) : (
        <SkeletonBlock height={190} />
      )}
      <SectionLabel>How it works</SectionLabel>
      <Card>
        <Text style={styles.dim}>Each completed timer bills per-minute (1-hr minimum) at ₹150/hr. Your 80% lands here after the customer pays; pending shows rides still running.</Text>
      </Card>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', borderColor: '#4f46e5', borderWidth: 1.5 },
  kicker: { fontSize: 13, fontWeight: '800', color: '#4338ca', textTransform: 'uppercase', letterSpacing: 1 },
  balance: { fontSize: 52, fontWeight: '800', color: '#111827', fontVariant: ['tabular-nums'] },
  split: { flexDirection: 'row', alignSelf: 'stretch' },
  dim: { color: '#6b7280', fontSize: 13 },
  error: { color: '#dc2626' },
});
