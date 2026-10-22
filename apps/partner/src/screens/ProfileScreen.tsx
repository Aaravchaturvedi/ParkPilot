import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Booking, ParkingSpace, KycStatus } from '../../../../packages/types/src';
import { summarizeBookings } from '../../../../packages/types/src';
import { listBookings, mySpaces, submitKyc } from '../../../../packages/api/src/index';
import { useSession } from '../../../../packages/mobile/src/store/session';
import { AppHeader, Avatar, Button, Card, Divider, ListRow, Screen, SectionLabel, SkeletonBlock, Stat, FadeIn, theme } from '../../../../packages/ui/src';

const KYC_STEPS = ['Documents', 'Review', 'Verified'];

const KYC_COLORS: Record<KycStatus, { bg: string; fg: string }> = {
  VERIFIED: { bg: '#dcfce7', fg: '#15803d' },
  SUBMITTED: { bg: '#fef3c7', fg: '#b45309' },
  PENDING: { bg: '#f1f5f9', fg: '#475569' },
  REJECTED: { bg: '#fee2e2', fg: '#991b1b' },
};

interface ProfileScreenProps {
  online: boolean;
  onSignOut: () => void;
  kycStatus?: KycStatus;
  onKycChanged?: (status: KycStatus) => void;
}

// Partner profile: identity + integrated KYC, earnings rollup (agrees with Wallet),
// fleet (spaces), sign out.
export function ProfileScreen({ online, onSignOut, kycStatus, onKycChanged }: ProfileScreenProps): React.JSX.Element {
  const { user } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [spaces, setSpaces] = useState<ParkingSpace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [kycBusy, setKycBusy] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  const currentKyc = kycStatus ?? user?.kycStatus ?? 'PENDING';
  const kycStage = currentKyc === 'VERIFIED' ? 3 : currentKyc === 'SUBMITTED' ? 2 : currentKyc === 'REJECTED' ? 0 : 1;

  const handleKycSubmit = async (): Promise<void> => {
    setKycBusy(true);
    setKycError(null);
    try {
      const { user: updated } = await submitKyc();
      onKycChanged?.(updated.kycStatus);
    } catch {
      setKycError('Submission failed — please try again.');
    } finally {
      setKycBusy(false);
    }
  };

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
      <AppHeader title="Profile" right={<Avatar name={user.name} size={40} />} />
      <FadeIn>
        <Card style={styles.hero}>
          <Avatar name={user.name} size={64} />
          <View style={styles.idCol}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.dim}>{user.email}</Text>
            <Text style={styles.role}>
              {user.role} · {online ? '● Online' : '○ Offline'}
            </Text>
          </View>
        </Card>
      </FadeIn>

      <SectionLabel>Verification (KYC)</SectionLabel>
      <Card>
        <View style={styles.kycHeadRow}>
          <View style={styles.kycHeadCol}>
            <Text style={styles.kycTitle}>Partner Verification</Text>
            <Text style={styles.dim}>Status: {currentKyc}</Text>
          </View>
          <Text style={[styles.kycPill, { backgroundColor: (KYC_COLORS[currentKyc] || KYC_COLORS.PENDING).bg, color: (KYC_COLORS[currentKyc] || KYC_COLORS.PENDING).fg }]}>
            {currentKyc}
          </Text>
        </View>

        <View style={styles.steps}>
          {KYC_STEPS.map((s, i) => {
            const n = i + 1;
            const done = n < kycStage || kycStage === 3;
            const now = n === kycStage && kycStage < 3;
            return (
              <View key={s} style={styles.step}>
                <View style={[styles.bubble, done && styles.bubbleDone, now && styles.bubbleNow]}>
                  {done ? (
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                  ) : (
                    <Text style={[styles.bubbleText, (done || now) && styles.bubbleTextOn]}>{n}</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, (done || now) && styles.stepLabelOn]}>{s}</Text>
              </View>
            );
          })}
        </View>

        {currentKyc === 'PENDING' ? (
          <Button
            title="Submit verification documents"
            block
            loading={kycBusy}
            onPress={handleKycSubmit}
            disabled={kycBusy}
          />
        ) : null}

        {currentKyc === 'REJECTED' ? (
          <Button
            title="Resubmit verification documents"
            block
            loading={kycBusy}
            onPress={handleKycSubmit}
            disabled={kycBusy}
          />
        ) : null}

        {currentKyc === 'SUBMITTED' ? (
          <View style={styles.statusBox}>
            <Ionicons name="time-outline" size={18} color="#d97706" />
            <Text style={styles.statusBoxText}>Documents under review by administration</Text>
          </View>
        ) : null}

        {currentKyc === 'VERIFIED' ? (
          <View style={styles.statusBoxVerified}>
            <Ionicons name="shield-checkmark" size={18} color="#15803d" />
            <Text style={styles.statusBoxTextVerified}>Account verified for all partner dispatches</Text>
          </View>
        ) : null}

        {kycError ? <Text style={styles.errorText}>{kycError}</Text> : null}
      </Card>

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
        <ListRow title="Payouts" sub="Direct Transfer" />
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
  kycHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kycHeadCol: { flex: 1, gap: 2 },
  kycTitle: { fontSize: 16, fontWeight: '800', color: theme.color.ink },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    marginVertical: 4,
  },
  step: { alignItems: 'center', gap: 4 },
  bubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleDone: { backgroundColor: '#16a34a' },
  bubbleNow: { backgroundColor: '#000000' },
  bubbleText: { fontWeight: '800', color: '#6b7280' },
  bubbleTextOn: { color: '#ffffff' },
  stepLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  stepLabelOn: { color: theme.color.ink, fontWeight: '700' },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  statusBoxText: {
    fontSize: 13,
    color: '#b45309',
    fontWeight: '600',
    flex: 1,
  },
  statusBoxVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  statusBoxTextVerified: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '700',
    flex: 1,
  },
  errorText: {
    fontSize: 13,
    color: theme.color.danger,
    marginTop: 4,
  },
  kycPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    fontWeight: '700',
    fontSize: 12,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
