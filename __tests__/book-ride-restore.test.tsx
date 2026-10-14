import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { Booking } from '../packages/types/src';
import { BookRideScreen } from '../apps/customer/src/screens/BookRideScreen';
import { listBookings } from '../packages/api/src/index';

jest.mock('../packages/mobile/src/socket', () => {
  const sock = { on: jest.fn(), off: jest.fn(), emit: jest.fn(), emitWithAck: jest.fn() };
  return { connectSocket: jest.fn(() => sock), getSocket: jest.fn(() => sock), ensureSocket: jest.fn(() => sock) };
});

jest.mock('../packages/api/src/index', () => ({
  quoteDriverHours: jest.fn(),
  createBooking: jest.fn(),
  cancelBooking: jest.fn(),
  listBookings: jest.fn(),
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>, Marker: () => null };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, WebView: () => <View /> };
});

const mockList = listBookings as jest.Mock;

function booking(id: string, status: Booking['status']): Booking {
  return {
    id,
    type: 'DRIVER',
    status,
    customerId: 'cus1',
    partnerId: null,
    vehicleId: null,
    spaceId: null,
    pickupLat: 28.62,
    pickupLng: 77.21,
    dropLat: null,
    dropLng: null,
    distanceKm: null,
    estimatedHours: 2,
    pricePerHourPaise: 15000,
    startOtp: null,
    startOtpExpiresAt: null,
    startedAt: null,
    endOtp: null,
    endOtpExpiresAt: null,
    endedAt: null,
    billedMinutes: null,
    amountPaise: 30000,
    commissionBps: 2000,
    platformFeePaise: 6000,
    partnerPayoutPaise: 24000,
    paymentStatus: 'PENDING',
  };
}

function Screen(): React.JSX.Element {
  return <BookRideScreen apiURL="http://x" token="tok" onTracking={() => undefined} />;
}

describe('BookRideScreen restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a fresh quote UI when no booking is open', async () => {
    mockList.mockResolvedValue({ bookings: [] });
    const { getByText, queryByText } = render(<Screen />);
    expect(getByText(/hire a driver/i)).toBeTruthy();
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(queryByText('REQUESTED')).toBeNull();
    expect(queryByText(/bk-/)).toBeNull();
  });

  it('restores the open REQUESTED booking from the ledger (offline-accept scenario)', async () => {
    const b = booking('bkreq001', 'REQUESTED');
    mockList.mockResolvedValue({ bookings: [b] });
    const { findByText, getByText } = render(<Screen />);
    // Card recovered with live status instead of a blank quote screen…
    expect(await findByText('REQUESTED')).toBeTruthy();
    expect(getByText(/bkreq001/)).toBeTruthy();
    expect(getByText(/waiting for a partner/i)).toBeTruthy();
  });

  it('restores an ACCEPTED booking so the trip entry point survives restart', async () => {
    const b = booking('bkacc002', 'ACCEPTED');
    mockList.mockResolvedValue({ bookings: [b] });
    const { findByText } = render(<Screen />);
    expect(await findByText('ACCEPTED')).toBeTruthy();
    expect(await findByText(/open trip/i)).toBeTruthy();
  });
});
