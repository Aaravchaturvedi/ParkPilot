import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Booking } from '../../../../packages/types/src';
import { Button } from '../../../../packages/ui/src';

interface PaymentModalProps {
  visible: boolean;
  booking: Booking | null;
  onPay: () => Promise<void>;
  onPaidSuccess: () => void;
}

export function PaymentModal({
  visible,
  booking,
  onPay,
  onPaidSuccess,
}: PaymentModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<'pending' | 'success'>('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animations
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const ringScaleAnim = useRef(new Animated.Value(0.8)).current;
  const ringOpacityAnim = useRef(new Animated.Value(0.7)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Reset or initialize state when visibility changes
  useEffect(() => {
    if (visible) {
      if (booking?.paymentStatus === 'COMPLETED') {
        setStep('success');
      } else {
        setStep('pending');
      }
      setError(null);
      setBusy(false);
    }
  }, [visible, booking?.paymentStatus]);

  // Run celebratory animation on success
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
        onPaidSuccess();
      }, 1900);

      return () => clearTimeout(timer);
    }
  }, [step, scaleAnim, ringScaleAnim, ringOpacityAnim, fadeAnim, onPaidSuccess]);

  if (!visible || !booking) return null;

  const fareRs = ((booking.amountPaise || 0) / 100).toFixed(0);
  const driverPayoutRs = ((booking.partnerPayoutPaise || 0) / 100).toFixed(2);
  const durationMin = booking.billedMinutes || Math.round((booking.estimatedHours || 1) * 60);

  const handlePayPress = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onPay();
      setStep('success');
    } catch {
      setError('Payment processing failed — please tap to retry.');
    } finally {
      setBusy(false);
    }
  };

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
              <Text style={styles.subtitle}>Driver has arrived at your destination</Text>

              {/* Status Pill */}
              <View style={styles.pendingPill}>
                <View style={styles.pendingDot} />
                <Text style={styles.pendingText}>Payment Pending</Text>
              </View>

              {/* Fare Display */}
              <View style={styles.fareBox}>
                <Text style={styles.fareCurrency}>₹</Text>
                <Text style={styles.fareNumber}>{fareRs}</Text>
              </View>

              {/* Bill Details */}
              <View style={styles.billDetails}>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Trip Duration</Text>
                  <Text style={styles.billValue}>{durationMin} min</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Billing Rate</Text>
                  <Text style={styles.billValue}>₹150 / hr</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Driver Payout</Text>
                  <Text style={styles.billValue}>₹{driverPayoutRs}</Text>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Pay Button */}
              <Button
                title={busy ? 'Processing payment…' : `Pay ₹${fareRs} Now`}
                icon={<Ionicons name="card" size={18} color="#ffffff" />}
                block
                loading={busy}
                onPress={handlePayPress}
                disabled={busy}
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
                <Text style={styles.successTitle}>Payment Successful!</Text>
                <Text style={styles.successAmount}>₹{fareRs} Paid</Text>
                <Text style={styles.successSub}>Thank you for riding with ParkPilot</Text>
                <Text style={styles.redirectNote}>Taking you back to homepage…</Text>
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
  topIconText: {
    fontSize: 28,
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
  fareBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginVertical: 12,
  },
  fareCurrency: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
    marginRight: 2,
  },
  fareNumber: {
    fontSize: 54,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -1,
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
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
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
  checkGlyph: {
    fontSize: 42,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 48,
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
