import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button, Field } from '../../../ui/src';
import { friendlyAuthError } from '../../../api/src';
import { useSession } from '../store/session';

export function LoginScreen({ onSwitch }: { onSwitch: () => void }): React.JSX.Element {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(friendlyAuthError(e, 'Login failed — try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Welcome back</Text>
      <Field label="Email" placeholder="you@example.com" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Field label="Password" placeholder="••••••" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
      <Text style={styles.switch} onPress={onSwitch}>
        New here? Create an account
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
