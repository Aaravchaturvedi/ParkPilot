import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking } from '../../../../packages/types/src';
import { summarizeBookings } from '../../../../packages/types/src';
import { listBookings } from '../../../../packages/api/src/index';
import { useSession } from '../../../../packages/mobile/src/store/session';
import { AppHeader, Avatar, Button, Card, Divider, ListRow, Screen, SectionLabel, SkeletonBlock, Stat, FadeIn, theme } from '../../../../packages/ui/src';

// Customer profile: identity, trip rollup (agrees with Trips + wallet math),
// account facts, sign out. Replaces the bare "Out" tab.
export function ProfileScreen({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const { user } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const { bookings: list } = await listBookings();
      setBookings(list);
    } catch {
      // keep last-known stats; a retry is one pull away
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  if (!user) return <View style={{ flex: 1 }} />;

  const summary = bookings ? summarizeBookings(bookings, user.id) : null;

  return (
    <Screen refreshing={loading} onRefresh={() => refresh(false)}>
      <AppHeader title="Profile" right={<Avatar name={user.name} size={40} />} />
      <FadeIn>
        <Card style={styles.hero}>
          <Avatar name={user.name} size={64} />
          <View style={styles.idCol}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.dim}>{user.email}</Text>
            <Text style={styles.role}>{user.role} · KYC {user.kycStatus}</Text>
          </View>
        </Card>
      </FadeIn>
      <SectionLabel>My activity</SectionLabel>
      {summary ? (
        <Card>
          <View style={styles.stats}>
            <Stat label="Trips" value={String(summary.total)} />
            <Stat label="Active" value={String(summary.active)} />
            <Stat label="Done" value={String(summary.completed)} />
          </View>
          <Divider />
          <View style={styles.stats}>
            <Stat label="Paid" value={`₹${(summary.asCustomerSpentPaise / 100).toFixed(0)}`} />
          </View>
        </Card>
      ) : (
        <SkeletonBlock height={140} />
      )}
      <SectionLabel>Account</SectionLabel>
      <Card style={styles.padless}>
        <ListRow title="Member since" right={<Text style={styles.dim}>{new Date(user.createdAt).toLocaleDateString()}</Text>} />
        <Divider />
        <ListRow title="Account type" right={<Text style={styles.dim}>{user.role}</Text>} />
      </Card>
      <Button title="Sign out" variant="danger" block onPress={onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  idCol: { flex: 1, gap: 4 },
  name: { fontSize: theme.type.title, fontWeight: '800', color: theme.color.ink },
  role: { fontSize: theme.type.small, fontWeight: '700', color: theme.color.ink },
  dim: { color: theme.color.sub, fontSize: 13 },
  stats: { flexDirection: 'row' },
  padless: { paddingHorizontal: 2, paddingVertical: 2 },
});
