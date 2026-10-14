import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import type { Booking, ParkingSpace } from '../../../../packages/types/src';
import { summarizeBookings } from '../../../../packages/types/src';
import { listBookings, mySpaces } from '../../../../packages/api/src/index';
import { useSession } from '../../../../packages/mobile/src/store/session';
import { Avatar, Button, Card, SkeletonBlock, Stat, FadeIn, theme } from '../../../../packages/ui/src';

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

  if (!user) return <View style={styles.root} />;

  const summary = bookings ? summarizeBookings(bookings, user.id) : null;
  const liveSpaces = spaces ? spaces.filter((s) => s.isActive).length : null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh(false)} />}
    >
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
      <Text style={styles.section}>Earnings</Text>
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
      <Text style={styles.section}>Fleet</Text>
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
      <Text style={styles.section}>Account</Text>
      <Card>
        <Text style={styles.dim}>Member since {new Date(user.createdAt).toLocaleDateString()}</Text>
        <Text style={styles.dim}>Payouts every 3–4 days via UPI/NEFT (mock).</Text>
      </Card>
      <Button title="Sign out" variant="danger" onPress={onSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: 16, gap: 12 },
  hero: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  idCol: { flex: 1, gap: 4 },
  name: { fontSize: theme.type.title, fontWeight: '800', color: theme.color.ink },
  role: { fontSize: theme.type.small, fontWeight: '700', color: theme.color.brandDark },
  dim: { color: theme.color.sub },
  section: { fontSize: theme.type.small, fontWeight: '800', color: theme.color.sub, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  stats: { flexDirection: 'row' },
});
