import type { MapStyleElement } from 'react-native-maps';

/**
 * Google Maps (Android) night style. Land, water and borders keep clear contrast so
 * the province reads at a glance even fully zoomed out.
 */
export const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1f2925' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c3ccc5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111714' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#6f8277' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#9fb1a6' }, { weight: 1.5 }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#36453d' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4b5d53' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1d4257' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8fb4c8' }] },
];

/** Light style: hides POI clutter so advisory overlays stay readable. */
export const LIGHT_MAP_STYLE: MapStyleElement[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
