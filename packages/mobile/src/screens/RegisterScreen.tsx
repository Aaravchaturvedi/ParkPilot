import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Button, Field } from '../../../ui/src';
import { friendlyAuthError } from '../../../api/src';
import { useSession } from '../store/session';

export function RegisterScreen({ onSwitch, role }: { onSwitch: () => void; role?: string }): React.JSX.Element {
  const { register } = useSession();
  const safeInsets = React.useContext(SafeAreaInsetsContext);
  const insets = safeInsets ?? { top: 0, bottom: 0, left: 0, right: 0 };
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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(insets.top + 16, 32),
          paddingBottom: Math.max(insets.bottom + 16, 24),
          paddingLeft: Math.max(insets.left, 24),
          paddingRight: Math.max(insets.right, 24),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.logoRow}>
          <Image
            source={require('../../../ui/src/assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#ffffff' },
  container: { flexGrow: 1, justifyContent: 'center' },
  card: { gap: 12, width: '100%' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8, color: '#09090b', textAlign: 'center' },
  error: { color: '#dc2626' },
  switch: { color: '#09090b', marginTop: 12, textAlign: 'center', fontWeight: '600' },
  logoRow: { alignItems: 'center', marginBottom: 8 },
  logo: { width: 90, height: 90 },
});
