import React from 'react';
import { Text, StyleSheet } from 'react-native';
import type { BookingStatus } from '../../types/src';

const COLORS: Record<BookingStatus, { bg: string; fg: string }> = {
  REQUESTED: { bg: '#fef3c7', fg: '#92400e' },
  ACCEPTED: { bg: '#dbeafe', fg: '#1e40af' },
  ONGOING: { bg: '#e0e7ff', fg: '#3730a3' },
  COMPLETED: { bg: '#d1fae5', fg: '#065f46' },
  CANCELLED: { bg: '#fee2e2', fg: '#991b1b' },
};

export function StatusPill({ status }: { status: BookingStatus }): React.JSX.Element {
  const c = COLORS[status];
  return <Text style={[styles.pill, { backgroundColor: c.bg, color: c.fg }]}>{status}</Text>;
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, fontWeight: '700', fontSize: 12, overflow: 'hidden' },
});
