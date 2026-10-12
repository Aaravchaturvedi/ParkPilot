import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { KycStatus } from '../../../../packages/types/src';
import { submitKyc } from '../../../../packages/api/src/index';
import { Button, Card } from '../../../../packages/ui/src';

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

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Verification</Text>
      <Card>
        <Text>Status: {status}</Text>
        <Text style={styles.dim}>Mock: Aadhaar + license + police checks plug in here (Phase B).</Text>
        {status === 'PENDING' ? <Button title={busy ? 'Submitting…' : 'Submit documents (mock)'} onPress={submit} disabled={busy} /> : null}
      </Card>
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
