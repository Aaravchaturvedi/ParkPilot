import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Booking, ParkingSpace } from '../../../../packages/types/src';
import { summarizeBookings } from '../../../../packages/types/src';
import { listBookings, mySpaces } from '../../../../packages/api/src/index';
import { useSession } from '../../../../packages/mobile/src/store/session';
import { AppHeader, Avatar, Button, Card, Divider, ListRow, Screen, SectionLabel, SkeletonBlock, Stat, FadeIn, theme } from '../../../../packages/ui/src';

// Partner profile: identity + KYC, earnings rollup (agrees with Wallet),
// fleet (spaces), sign out. Replaces the bare "Out" tab.
export function ProfileScreen({ online, onSignOut }: { online: boolean; onSignOut: () => void }): React.JSX.Element {
  const { user } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [spaces, setSpaces] = useState<ParkingSpace[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const [b, s] = await Promise.all([listBookings(), mySpaces()]);
      setBookings(b.bookings);
      setSpaces(s.spaces);
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
  const liveSpaces = spaces ? spaces.filter((s) => s.isActive).length : null;

  return (
    <Screen refreshing={loading} onRefresh={() => refresh(false)}>
      <AppHeader title="You" subtitle="Partner profile" right={<Avatar name={user.name} size={40} />} />
      <FadeIn>
        <Card style={styles.hero}>
          <Avatar name={user.name} size={64} />
          <View style={styles.idCol}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.dim}>{user.email}</Text>
            <Text style={styles.role}>
              {user.role} · {online ? '● Online' : '○ Offline'} · KYC {user.kycStatus}
            </Text>
          </View>
        </Card>
      </FadeIn>
      <SectionLabel>Earnings</SectionLabel>
      {summary ? (
        <Card>
          <View style={styles.stats}>
            <Stat label="Rides done" value={String(summary.completed)} />
            <Stat label="Earned" value={`₹${(summary.asPartnerEarnedPaise / 100).toFixed(0)}`} />
            <Stat label="Pending" value={`₹${(summary.asPartnerPendingPaise / 100).toFixed(0)}`} />
          </View>
        </Card>
      ) : (
        <SkeletonBlock height={104} />
      )}
      <SectionLabel>Fleet</SectionLabel>
      <Card>
        {spaces ? (
          <View style={styles.stats}>
            <Stat label="Spaces" value={String(spaces.length)} />
            <Stat label="Live" value={String(liveSpaces ?? 0)} />
            <Stat label="Trips active" value={String(summary?.active ?? 0)} />
          </View>
        ) : (
          <SkeletonBlock height={88} />
        )}
      </Card>
      <SectionLabel>Account</SectionLabel>
      <Card style={styles.padless}>
        <ListRow title="Member since" right={<Text style={styles.dim}>{new Date(user.createdAt).toLocaleDateString()}</Text>} />
        <Divider />
        <ListRow title="Payouts" sub="Every 3–4 days via UPI/NEFT (mock)" />
      </Card>
      <Button title="Sign out" variant="danger" block onPress={onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  idCol: { flex: 1, gap: 4 },
  name: { fontSize: theme.type.title, fontWeight: '800', color: theme.color.ink },
  role: { fontSize: theme.type.small, fontWeight: '700', color: theme.color.brandDark },
  dim: { color: theme.color.sub, fontSize: 13 },
  stats: { flexDirection: 'row' },
  padless: { paddingHorizontal: 2, paddingVertical: 2 },
});
