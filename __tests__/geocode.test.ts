import { __resetGeocodeCache, coordsLabel, reverseGeocode, shortAddress } from '../packages/mobile/src/map/geocode';

describe('shortAddress', () => {
  it('keeps the nearest-first English parts', () => {
    expect(shortAddress('Shop 12, Main Bazaar, Connaught Place, New Delhi, Delhi, 110001, India', 'fb')).toBe(
      'Shop 12, Main Bazaar, Connaught Place',
    );
  });

  it('falls back when empty', () => {
    expect(shortAddress(null, 'fb')).toBe('fb');
    expect(shortAddress('  ,  ', 'fb')).toBe('fb');
  });

  it('formats coords fallback', () => {
    expect(coordsLabel(28.63156, 77.21671)).toBe('28.6316, 77.2167');
  });
});

describe('reverseGeocode', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    __resetGeocodeCache();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns display_name and caches by rounded coords', async () => {
    const mock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ display_name: 'A, B, C' }) });
    global.fetch = mock as unknown as typeof fetch;
    await expect(reverseGeocode(28.63155, 77.21671)).resolves.toBe('A, B, C');
    await expect(reverseGeocode(28.63156, 77.21672)).resolves.toBe('A, B, C');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toContain('nominatim.openstreetmap.org/reverse');
  });

  it('returns null on failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(reverseGeocode(1, 2)).resolves.toBeNull();
  });

  it('falls back to BigDataCloud when Nominatim is blocked', async () => {
    const mock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ locality: 'East Delhi', city: 'Delhi', principalSubdivision: 'Delhi', countryName: 'India' }),
      });
    global.fetch = mock as unknown as typeof fetch;
    await expect(reverseGeocode(28.6261, 77.255)).resolves.toBe('East Delhi, Delhi, India');
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0]).toContain('api-bdc.io');
  });
});
