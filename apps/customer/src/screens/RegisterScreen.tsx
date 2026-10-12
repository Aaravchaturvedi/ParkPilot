import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Button } from '../../../../packages/ui/src';
import { useSession } from '../store/session';

export function RegisterScreen({ onSwitch }: { onSwitch: () => void }): React.JSX.Element {
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
      await register(name.trim(), email.trim(), password);
    } catch {
      setError('Sign-up failed — email may be taken (min 6-char password).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Create account</Text>
      <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
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
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 16 },
  error: { color: '#dc2626' },
  switch: { color: '#2563eb', marginTop: 8, textAlign: 'center' },
});
