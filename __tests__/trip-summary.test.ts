import { summarizeBookings, type Booking } from '../packages/types/src';

function booking(over: Partial<Booking> & { id: string }): Booking {
  return {
    type: 'DRIVER',
    status: 'REQUESTED',
    customerId: 'me',
    partnerId: null,
    vehicleId: null,
    spaceId: null,
    pickupLat: null,
    pickupLng: null,
    dropLat: null,
    dropLng: null,
    distanceKm: null,
    estimatedHours: 1,
    pricePerHourPaise: 15000,
    startOtp: null,
    startOtpExpiresAt: null,
    startedAt: null,
    endOtp: null,
    endOtpExpiresAt: null,
    endedAt: null,
    billedMinutes: null,
    amountPaise: 15000,
    commissionBps: 2000,
    platformFeePaise: 3000,
    partnerPayoutPaise: 12000,
    paymentStatus: 'PENDING',
    ...over,
  };
}

describe('summarizeBookings', () => {
  it('rolls up counts, spend and earnings like the wallet', () => {
    const list = [
      booking({ id: 'a', status: 'REQUESTED' }),
      booking({ id: 'b', status: 'COMPLETED', paymentStatus: 'COMPLETED' }),
      booking({ id: 'c', status: 'COMPLETED', customerId: 'other', partnerId: 'me' }),
      booking({ id: 'd', status: 'ONGOING', customerId: 'other', partnerId: 'me' }),
    ];
    const s = summarizeBookings(list, 'me');
    expect(s).toEqual({
      total: 4,
      active: 2,
      completed: 2,
      asCustomerSpentPaise: 15000,
      asPartnerEarnedPaise: 12000,
      asPartnerPendingPaise: 12000,
    });
  });

  it('is empty-safe', () => {
    expect(summarizeBookings([], 'me')).toEqual({
      total: 0,
      active: 0,
      completed: 0,
      asCustomerSpentPaise: 0,
      asPartnerEarnedPaise: 0,
      asPartnerPendingPaise: 0,
    });
  });
});
