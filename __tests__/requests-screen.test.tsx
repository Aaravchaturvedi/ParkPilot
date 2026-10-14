import React, { useState } from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { Booking } from '../packages/types/src';
import { RequestsScreen, type Incoming } from '../apps/partner/src/screens/RequestsScreen';
import { connectSocket } from '../packages/mobile/src/socket';

jest.mock('../packages/mobile/src/socket', () => ({
  connectSocket: jest.fn(),
  getSocket: jest.fn(() => null),
}));

jest.mock('../packages/api/src/index', () => ({
  acceptBooking: jest.fn(),
}));

// react-native-maps needs a native binary; stub it (screens only pass
// <Marker> elements as data — SafeMap renders OSM in a WebView instead).
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    Marker: () => null,
  };
});

// WebView renders real maps on device; in tests it is a stub.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    WebView: () => <View />,
  };
});

const mockConnect = connectSocket as jest.Mock;

function booking(id: string): Booking {
  return {
    id,
    type: 'DRIVER',
    status: 'REQUESTED',
    customerId: 'cus1',
    partnerId: null,
    vehicleId: null,
    spaceId: null,
    pickupLat: 28.62,
    pickupLng: 77.21,
    dropLat: 28.6129,
    dropLng: 77.2295,
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
    amountPaise: 8000,
    commissionBps: 1500,
    platformFeePaise: 1200,
    partnerPayoutPaise: 6800,
    paymentStatus: 'PENDING',
  };
}

function Harness({ initial, online = true }: { initial: Incoming[]; online?: boolean }) {
  const [incoming, setIncoming] = useState<Incoming[]>(initial);
  const [on, setOn] = useState(online);
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <>
      <RequestsScreen
        apiURL="http://x"
        token="tok"
        online={on}
        setOnline={setOn}
        incoming={incoming}
        setIncoming={setIncoming}
        onActive={setActiveId}
      />
      {activeId ? <Text>{activeId}</Text> : null}
    </>
  );
}

describe('RequestsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state when no requests', () => {
    const { getByText } = render(<Harness initial={[]} />);
    expect(getByText(/no requests yet/i)).toBeTruthy();
  });

  it('exposes estimate, rate, pickup and distance on each request', () => {
    const b = booking('bk-geo-1');
    mockConnect.mockReturnValue({ emitWithAck: jest.fn(), emit: jest.fn() });
    const { getByText } = render(<Harness initial={[{ booking: b, at: Date.now() }]} />);
    // Estimate + fixed rate + where they are are always visible…
    expect(getByText(/2 hr/i)).toBeTruthy();
    expect(getByText(/150\/hr fixed/i)).toBeTruthy();
    expect(getByText(/pickup \(where they are\)/i)).toBeTruthy();
    // …and without device GPS the card says so instead of a fake distance.
    expect(getByText(/enable gps to see your distance|away from you/i)).toBeTruthy();
  });

  it('accept removes the card and notifies active ride', async () => {
    const b = booking('bk-accept-1');
    mockConnect.mockReturnValue({
      emitWithAck: jest.fn().mockResolvedValue({ ok: true, booking: { ...b, status: 'ACCEPTED' } }),
    });
    const { getByText, queryByText } = render(<Harness initial={[{ booking: b, at: Date.now() }]} />);
    expect(getByText(/bk-accep/)).toBeTruthy();
    fireEvent.press(getByText('Accept'));
    await waitFor(() => expect(queryByText('Accept')).toBeNull());
    // Accepted ride hands off to the App Ride tab via onActive (single source
    // of truth) — the inbox card is gone and the empty state returns.
    expect(getByText('bk-accept-1')).toBeTruthy();
    expect(getByText(/no requests yet/i)).toBeTruthy();
  });

  it('accept dismisses the card when another partner already took it', async () => {
    const b = booking('bk-taken-1');
    mockConnect.mockReturnValue({
      emitWithAck: jest.fn().mockResolvedValue({ ok: false, error: 'booking_not_requested' }),
    });
    const { getByText, queryByText, findByText } = render(<Harness initial={[{ booking: b, at: Date.now() }]} />);
    fireEvent.press(getByText('Accept'));
    await waitFor(() => expect(queryByText('Accept')).toBeNull());
    expect(await findByText(/already taken/i)).toBeTruthy();
  });

  it('reject removes the card', async () => {
    const b = booking('bk-reject-1');
    mockConnect.mockReturnValue({ emitWithAck: jest.fn().mockResolvedValue({ ok: true }) });
    const { getByText, queryByText } = render(<Harness initial={[{ booking: b, at: Date.now() }]} />);
    fireEvent.press(getByText('Reject'));
    await waitFor(() => expect(queryByText(/bk-rejec/)).toBeNull());
  });

  it('toggle flips online state only after server confirms', async () => {
    mockConnect.mockReturnValue({ emitWithAck: jest.fn().mockResolvedValue({ ok: true }), emit: jest.fn() });
    const { getByText, findByText } = render(<Harness initial={[]} online={false} />);
    fireEvent.press(getByText('Go online'));
    expect(await findByText('Go offline')).toBeTruthy();
  });

  it('toggle stays offline and shows error when server rejects', async () => {
    mockConnect.mockReturnValue({
      emitWithAck: jest.fn().mockResolvedValue({ ok: false, error: 'only_partners' }),
      emit: jest.fn(),
    });
    const { getByText, findByText, queryByText } = render(<Harness initial={[]} online={false} />);
    fireEvent.press(getByText('Go online'));
    expect(await findByText(/go-online failed|only_partners/i)).toBeTruthy();
    expect(queryByText('Go offline')).toBeNull();
  });
});
