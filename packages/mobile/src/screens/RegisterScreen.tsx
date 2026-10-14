import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button, Field } from '../../../ui/src';
import { friendlyAuthError } from '../../../api/src';
import { useSession } from '../store/session';

export function RegisterScreen({ onSwitch, role }: { onSwitch: () => void; role?: string }): React.JSX.Element {
  const { register } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await register(name.trim(), email.trim(), password, role);
    } catch (e) {
      setError(friendlyAuthError(e, 'Sign-up failed — try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Create account</Text>
      <Field label="Name" placeholder="Your name" value={name} onChangeText={setName} />
      <Field label="Email" placeholder="you@example.com" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Field label="Password" placeholder="Min 6 characters" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={busy ? 'Creating…' : 'Create account'} onPress={submit} disabled={busy} />
      <Text style={styles.switch} onPress={onSwitch}>
        Have an account? Sign in
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  error: { color: '#dc2626' },
  switch: { color: '#2563eb', marginTop: 8, textAlign: 'center' },
});
