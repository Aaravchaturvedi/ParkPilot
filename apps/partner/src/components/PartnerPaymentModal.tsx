import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Booking } from '../../../../packages/types/src';
import { Button } from '../../../../packages/ui/src';

interface PartnerPaymentModalProps {
  visible: boolean;
  booking: Booking | null;
  onDone: () => void;
}

export function PartnerPaymentModal({
  visible,
  booking,
  onDone,
}: PartnerPaymentModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<'pending' | 'success'>('pending');

  // Celebratory animations
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const ringScaleAnim = useRef(new Animated.Value(0.8)).current;
  const ringOpacityAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const isPaid = booking?.paymentStatus === 'COMPLETED' || (booking?.paymentStatus as string) === 'PAID';

  // React to payment status updates
  useEffect(() => {
    if (!visible) return;
    if (isPaid) {
      setStep('success');
    } else {
      setStep('pending');
    }
  }, [visible, isPaid]);

  // Run celebratory animation on success and automatically return to homepage
  useEffect(() => {
    if (step === 'success') {
      scaleAnim.setValue(0);
      ringScaleAnim.setValue(0.8);
      ringOpacityAnim.setValue(0.8);
      fadeAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 45,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.parallel([
            Animated.timing(ringScaleAnim, {
              toValue: 1.5,
              duration: 1200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacityAnim, {
              toValue: 0,
              duration: 1200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        ),
      ]).start();

      const timer = setTimeout(() => {
        onDone();
      }, 2200);

      return () => clearTimeout(timer);
    }
  }, [step, scaleAnim, ringScaleAnim, ringOpacityAnim, fadeAnim, onDone]);

  if (!visible || !booking) return null;

  const fareRs = ((booking.amountPaise || 0) / 100).toFixed(0);
  const payoutRs = ((booking.partnerPayoutPaise || 0) / 100).toFixed(2);
  const feeRs = (((booking.amountPaise || 0) - (booking.partnerPayoutPaise || 0)) / 100).toFixed(2);
  const durationMin = booking.billedMinutes || Math.round((booking.estimatedHours || 1) * 60);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {step === 'pending' ? (
            <View style={styles.contentWrap}>
              {/* Header Badge */}
              <View style={styles.topIconBox}>
                <Ionicons name="flag" size={30} color="#10b981" />
              </View>

              <Text style={styles.title}>Ride Completed</Text>
              <Text style={styles.subtitle}>Waiting for customer to complete payment</Text>

              {/* Status Pill */}
              <View style={styles.pendingPill}>
                <View style={styles.pendingDot} />
                <Text style={styles.pendingText}>Payment Pending</Text>
              </View>

              {/* Payout Display */}
              <View style={styles.payoutBox}>
                <Text style={styles.payoutCurrency}>₹</Text>
                <Text style={styles.payoutNumber}>{payoutRs}</Text>
              </View>
              <Text style={styles.payoutLabel}>Your Payout</Text>

              {/* Bill Details */}
              <View style={styles.billDetails}>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Trip Duration</Text>
                  <Text style={styles.billValue}>{durationMin} min</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Gross Fare</Text>
                  <Text style={styles.billValue}>₹{fareRs}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Platform Fee</Text>
                  <Text style={styles.billValue}>-₹{feeRs}</Text>
                </View>
                <View style={[styles.billRow, styles.billRowHighlight]}>
                  <Text style={styles.billHighlightLabel}>Net Earnings</Text>
                  <Text style={styles.billHighlightValue}>₹{payoutRs}</Text>
                </View>
              </View>

              <Text style={styles.waitingNote}>Customer is reviewing the bill on their phone…</Text>

              <Button
                title="Back to requests"
                variant="secondary"
                block
                onPress={onDone}
              />
            </View>
          ) : (
            <View style={styles.successWrap}>
              {/* Animated Celebration Icon */}
              <View style={styles.animContainer}>
                {/* Expanding Pulse Ring */}
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      transform: [{ scale: ringScaleAnim }],
                      opacity: ringOpacityAnim,
                    },
                  ]}
                />

                {/* Confetti Particles */}
                <View style={[styles.particle, styles.p1]} />
                <View style={[styles.particle, styles.p2]} />
                <View style={[styles.particle, styles.p3]} />
                <View style={[styles.particle, styles.p4]} />
                <View style={[styles.particle, styles.p5]} />
                <View style={[styles.particle, styles.p6]} />

                {/* Checkmark Circle */}
                <Animated.View
                  style={[
                    styles.checkCircle,
                    {
                      transform: [{ scale: scaleAnim }],
                    },
                  ]}
                >
                  <Ionicons name="checkmark-sharp" size={44} color="#ffffff" />
                </Animated.View>
              </View>

              {/* Animated Text */}
              <Animated.View style={[styles.successTextWrap, { opacity: fadeAnim }]}>
                <Text style={styles.successTitle}>Payment Completed!</Text>
                <Text style={styles.successAmount}>₹{payoutRs} Received</Text>
                <Text style={styles.successSub}>Customer payment confirmed · Added to your Wallet</Text>
                <Text style={styles.redirectNote}>Taking you back to requests…</Text>
              </Animated.View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  contentWrap: {
    alignItems: 'center',
    gap: 8,
  },
  topIconBox: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fef3c7',
    borderWidth: 2,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#fffbeb',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d97706',
  },
  pendingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
  },
  payoutBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 10,
  },
  payoutCurrency: {
    fontSize: 24,
    fontWeight: '800',
    color: '#10b981',
    marginTop: 6,
    marginRight: 2,
  },
  payoutNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: -1,
  },
  payoutLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  billDetails: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billRowHighlight: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  billLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  billValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
  },
  billHighlightLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  billHighlightValue: {
    fontSize: 15,
    color: '#10b981',
    fontWeight: '800',
  },
  waitingNote: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 6,
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  animContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.28)',
  },
  checkCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  p1: { top: 0, left: 16, backgroundColor: '#f59e0b' },
  p2: { top: 10, right: 8, backgroundColor: '#3b82f6' },
  p3: { bottom: 12, left: 6, backgroundColor: '#ec4899' },
  p4: { bottom: 4, right: 14, backgroundColor: '#8b5cf6' },
  p5: { top: 44, left: -6, backgroundColor: '#10b981' },
  p6: { top: 40, right: -6, backgroundColor: '#6366f1' },
  successTextWrap: {
    alignItems: 'center',
    gap: 4,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  successAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#10b981',
    textAlign: 'center',
  },
  successSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  redirectNote: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    textAlign: 'center',
    marginTop: 8,
  },
});
