import React, { useState } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { Booking } from '../packages/types/src';
import { RequestsScreen, type Incoming } from '../apps/partner/src/screens/RequestsScreen';
import { connectSocket } from '../packages/mobile/src/socket';

jest.mock('../packages/mobile/src/socket', () => ({
  connectSocket: jest.fn(),
  getSocket: jest.fn(() => null),
}));

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
    distanceKm: 10,
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
      {activeId ? <>{activeId}</> : null}
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

  it('accept removes the card and notifies active ride', async () => {
    const b = booking('bk-accept-1');
    mockConnect.mockReturnValue({
      emitWithAck: jest.fn().mockResolvedValue({ ok: true, booking: { ...b, status: 'ACCEPTED' } }),
    });
    const { getByText, queryByText } = render(<Harness initial={[{ booking: b, at: Date.now() }]} />);
    expect(getByText(/bk-accep/)).toBeTruthy();
    fireEvent.press(getByText('Accept'));
    await waitFor(() => expect(queryByText('Accept')).toBeNull());
    expect(getByText(/active ride/i)).toBeTruthy();
    expect(getByText(/no requests yet/i)).toBeTruthy();
  });

  it('reject removes the card', async () => {
    const b = booking('bk-reject-1');
    mockConnect.mockReturnValue({ emitWithAck: jest.fn().mockResolvedValue({ ok: true }) });
    const { getByText, queryByText } = render(<Harness initial={[{ booking: b, at: Date.now() }]} />);
    fireEvent.press(getByText('Reject'));
    await waitFor(() => expect(queryByText(/bk-rejec/)).toBeNull());
  });

  it('toggle flips online state', () => {
    const { getByText } = render(<Harness initial={[]} online={false} />);
    fireEvent.press(getByText('Go online'));
    expect(getByText('Go offline')).toBeTruthy();
  });
});
