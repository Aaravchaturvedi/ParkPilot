import { pageHtml, zoomForDelta } from '../packages/mobile/src/map/osmTemplate';

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, WebView: () => <View /> };
});

jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null } }));

describe('OSM map template', () => {
  it('uses free OSM tiles with licence attribution and no key placeholders', () => {
    const html = pageHtml({ latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.05, longitudeDelta: 0.05 }, []);
    expect(html).toContain('tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(html).toContain('OpenStreetMap');
    expect(html).not.toMatch(/API_KEY|apiKey|AIza/);
  });

  it('bakes markers and wires live updates + center posts', () => {
    const html = pageHtml(
      { latitude: 28.62, longitude: 77.21, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      [{ latitude: 28.62, longitude: 77.21, title: 'Pickup', color: '#22c55e' }],
    );
    expect(html).toContain('28.62');
    expect(html).toContain('window.__updateMap');
    expect(html).toContain('ReactNativeWebView.postMessage');
    expect(html).toContain('leaflet');
  });

  it('maps region deltas to sane zooms', () => {
    expect(zoomForDelta(0.05)).toBeGreaterThanOrEqual(12);
    expect(zoomForDelta(0.05)).toBeLessThanOrEqual(14);
    expect(zoomForDelta(0.01)).toBeGreaterThan(zoomForDelta(0.05));
  });

  it('draws the driving route when given one, plain pins otherwise', () => {
    const region = { latitude: 28.62, longitude: 77.21, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    const withRoute = pageHtml(region, [], {
      from: { latitude: 28.6139, longitude: 77.209 },
      to: { latitude: 28.6315, longitude: 77.2167 },
    });
    expect(withRoute).toContain('router.project-osrm.org/route/v1/driving');
    expect(withRoute).toContain('drawRoute');
    const plain = pageHtml(region, []);
    expect(plain).toContain('drawRoute');
    expect(plain).not.toContain('router.project-osrm.org/route/v1/driving/77');
  });
});
