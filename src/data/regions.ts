import { Region } from './types';

export const regions: Region[] = [
  { id: 'winnipeg', name: 'Winnipeg', latitude: 49.8951, longitude: -97.1384, northFactor: 0.2, waterFactor: 0.32, airFactor: 0.26, vectorFactor: 0.34 },
  { id: 'brandon', name: 'Brandon', latitude: 49.8485, longitude: -99.9501, northFactor: 0.28, waterFactor: 0.26, airFactor: 0.38, vectorFactor: 0.25 },
  { id: 'steinbach', name: 'Steinbach', latitude: 49.5258, longitude: -96.6845, northFactor: 0.18, waterFactor: 0.34, airFactor: 0.22, vectorFactor: 0.4 },
  { id: 'portage', name: 'Portage la Prairie', latitude: 49.9728, longitude: -98.2926, northFactor: 0.22, waterFactor: 0.4, airFactor: 0.24, vectorFactor: 0.28 },
  { id: 'dauphin', name: 'Dauphin', latitude: 51.1494, longitude: -100.0502, northFactor: 0.48, waterFactor: 0.24, airFactor: 0.33, vectorFactor: 0.21 },
  { id: 'thompson', name: 'Thompson', latitude: 55.7435, longitude: -97.8558, northFactor: 0.92, waterFactor: 0.19, airFactor: 0.29, vectorFactor: 0.12 },
  { id: 'thepas', name: 'The Pas', latitude: 53.8251, longitude: -101.2541, northFactor: 0.66, waterFactor: 0.23, airFactor: 0.36, vectorFactor: 0.17 },
  { id: 'selkirk', name: 'Selkirk', latitude: 50.1436, longitude: -96.8845, northFactor: 0.24, waterFactor: 0.37, airFactor: 0.21, vectorFactor: 0.31 },
  { id: 'churchill', name: 'Churchill', latitude: 58.7684, longitude: -94.165, northFactor: 1, waterFactor: 0.18, airFactor: 0.2, vectorFactor: 0.06 },
  { id: 'flinflon', name: 'Flin Flon', latitude: 54.7682, longitude: -101.8642, northFactor: 0.76, waterFactor: 0.2, airFactor: 0.35, vectorFactor: 0.14 },
];
