// Ambient declarations for Expo/RN runtime deps.
// These packages are installed when running `expo start` (Day 9+ mobile env);
// declarations keep `tsc --noEmit` green in backend-only environments.
declare module 'expo-status-bar' {
  import * as React from 'react';
  export const StatusBar: React.ComponentType<Record<string, unknown>>;
}
declare module 'react-native-maps' {
  import * as React from 'react';
  export interface Region {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }
  export default class MapView extends React.Component<
    { initialRegion?: Region; style?: unknown; children?: React.ReactNode } & Record<string, unknown>
  > {}
  export class Marker extends React.Component<
    { coordinate: { latitude: number; longitude: number }; title?: string } & Record<string, unknown>
  > {}
}
declare module 'expo-location' {
  export function requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function getCurrentPositionAsync(): Promise<{ coords: { latitude: number; longitude: number } }>;
  export function watchPositionAsync(
    options: unknown,
    cb: (loc: { coords: { latitude: number; longitude: number } }) => void,
  ): Promise<{ remove(): void }>;
}
