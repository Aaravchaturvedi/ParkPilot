import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { KycStatus } from '../../../../packages/types/src';
import { submitKyc } from '../../../../packages/api/src/index';
import { AppHeader, Button, Card, Screen, SectionLabel } from '../../../../packages/ui/src';

const STEPS = ['Documents', 'Review', 'Verified'];

// Mock KYC (Aadhaar/license/police verification via Digio/Hyperverge is Phase B).
export function KycScreen({ status, onChanged }: { status: KycStatus; onChanged: (s: KycStatus) => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { user } = await submitKyc();
      onChanged(user.kycStatus);
    } catch {
      setError('Submit failed.');
    } finally {
      setBusy(false);
    }
  };

  const stage = status === 'VERIFIED' ? 3 : status === 'SUBMITTED' ? 2 : status === 'REJECTED' ? 0 : 1;

  return (
    <Screen>
      <AppHeader title="Verification" subtitle={`Status: ${status}`} />
      <Card>
        <View style={styles.steps}>
          {STEPS.map((s, i) => {
            const n = i + 1;
            const done = n < stage || stage === 3;
            const now = n === stage && stage < 3;
            return (
              <View key={s} style={styles.step}>
                <View style={[styles.bubble, done && styles.done, now && styles.now]}>
                  {done ? (
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                  ) : (
                    <Text style={[styles.bubbleText, (done || now) && styles.on]}>{n}</Text>
                  )}
                </View>
                <Text style={[styles.label, (done || now) && styles.labelOn]}>{s}</Text>
              </View>
            );
          })}
        </View>
        {status === 'PENDING' ? <Button title="Submit documents" block loading={busy} onPress={submit} disabled={busy} /> : null}
        {status === 'REJECTED' ? <Button title="Resubmit documents" block loading={busy} onPress={submit} disabled={busy} /> : null}
      </Card>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: '#6b7280', fontSize: 13 },
  steps: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  step: { alignItems: 'center', gap: 4 },
  bubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: '#16a34a' },
  now: { backgroundColor: '#000000' },
  bubbleText: { fontWeight: '800', color: '#6b7280' },
  on: { color: '#fff' },
  label: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  labelOn: { color: '#111827', fontWeight: '700' },
  error: { color: '#dc2626' },
});
