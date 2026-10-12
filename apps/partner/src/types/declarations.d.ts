// Same runtime-deps story as apps/customer: installed by `expo start`.
declare module 'expo-status-bar' {
  import * as React from 'react';
  export const StatusBar: React.ComponentType<Record<string, unknown>>;
}
declare module 'expo-secure-store' {
  export function getItemAsync(key: string): Promise<string | null>;
  export function setItemAsync(key: string, value: string): Promise<void>;
  export function deleteItemAsync(key: string): Promise<void>;
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
  export function requestBackgroundPermissionsAsync(): Promise<{ status: string }>;
  export function getCurrentPositionAsync(): Promise<{ coords: { latitude: number; longitude: number } }>;
  export function watchPositionAsync(
    options: unknown,
    cb: (loc: { coords: { latitude: number; longitude: number } }) => void,
  ): Promise<{ remove(): void }>;
}
