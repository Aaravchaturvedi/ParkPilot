import { haversineKm, formatKm, billedMinutesFor, runningCostPaise, formatElapsed } from '../packages/types/src';

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm(28.6139, 77.209, 28.6139, 77.209)).toBeCloseTo(0, 6);
  });

  it('measures Connaught Place to India Gate as ~2km (both apps share this)', () => {
    // CP 28.6315,77.2167 → India Gate 28.6129,77.2295 ≈ 2.4km
    const d = haversineKm(28.6315, 77.2167, 28.6129, 77.2295);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(3.5);
  });

  it('is symmetric', () => {
    const a = haversineKm(28.6, 77.2, 19.076, 72.8777);
    const b = haversineKm(19.076, 72.8777, 28.6, 77.2);
    expect(a).toBeCloseTo(b, 9);
  });

  it('sorts nearest-first with unknown last (partner inbox rule)', () => {
    const me = { lat: 28.6139, lng: 77.209 };
    const rows = [
      { id: 'far', kmAway: haversineKm(me.lat, me.lng, 19.076, 72.8777) },
      { id: 'unknown', kmAway: null as number | null },
      { id: 'near', kmAway: haversineKm(me.lat, me.lng, 28.62, 77.21) },
    ];
    rows.sort((x, y) => (x.kmAway ?? Infinity) - (y.kmAway ?? Infinity));
    expect(rows.map((r) => r.id)).toEqual(['near', 'far', 'unknown']);
  });

  it('formats short distances with 1 decimal', () => {
    expect(formatKm(2.34)).toBe('2.3 km');
    expect(formatKm(12.6)).toBe('13 km');
  });
});

describe('timer billing (mirrors backend computeTimerBill)', () => {
  const RATE = 15000; // ₹150/hr = ₹2.50/min

  it('applies the first-hour minimum', () => {
    expect(billedMinutesFor(30)).toBe(60);
    expect(billedMinutesFor(3599)).toBe(60);
    expect(runningCostPaise(30, RATE).amountPaise).toBe(15000);
  });

  it('rounds elapsed time up to the minute', () => {
    expect(billedMinutesFor(3601)).toBe(61);
    expect(billedMinutesFor(3660)).toBe(61);
    expect(runningCostPaise(3661, RATE).billedMinutes).toBe(62);
  });

  it('bills a 2h trip at exactly the estimate', () => {
    expect(runningCostPaise(7200, RATE)).toEqual({ billedMinutes: 120, amountPaise: 30000 });
  });

  it('formats elapsed clocks', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(3723)).toBe('01:02:03');
  });
});
