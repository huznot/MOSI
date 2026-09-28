/**
 * Legal copy shown in the app. docs/privacy-policy.html mirrors PRIVACY_POLICY for
 * the public URL Google Play requires - update both together.
 */

export const SUPPORT_EMAIL = 'huzisgreat@gmail.com';
export const LEGAL_LAST_UPDATED = 'September 26, 2026';
export const PRIVACY_POLICY_URL = 'https://huznot.github.io/MOSI/privacy-policy.html';

export const INDEPENDENCE_NOTICE =
  'MOSI is an independent app. It is not affiliated with, endorsed by, or operated by the Government of Manitoba, the Government of Canada, Manitoba Hydro, or any other data provider.';

export const SAFETY_NOTICE =
  'MOSI summarizes public data for general awareness. Information can be delayed, incomplete, or wrong. Always follow official warnings and instructions from authorities. In an emergency, call 911.';

export type LegalSection = { heading: string; paragraphs: string[] };

export const PRIVACY_POLICY: LegalSection[] = [
  {
    heading: 'The short version',
    paragraphs: [
      'MOSI has no accounts, no ads, no analytics, and no servers of its own. We do not sell, rent, or share your personal information.',
      'Your location is optional. If you allow it, it is used on your device to find your Manitoba area. A rounded version (about 1 km) is sent to weather services only to fetch the forecast for your area.',
    ],
  },
  {
    heading: 'Information MOSI uses',
    paragraphs: [
      'Location (optional, only while the app is open). With your permission, MOSI reads your device location to pick your health region and zone and to show nearby advisories. MOSI never accesses your location in the background.',
      'Settings stored on your device. Your chosen area, theme, and notification preference, plus cached public data so the app works offline. This never leaves your device and is deleted when you uninstall MOSI.',
      'MOSI does not collect your name, email, contacts, photos, device identifiers, or advertising ID.',
    ],
  },
  {
    heading: 'Third-party services',
    paragraphs: [
      'To show conditions, the app downloads public data directly from: Environment and Climate Change Canada, Natural Resources Canada (CWFIS), the Province of Manitoba, Pelmorex (NAAD emergency alerts), Manitoba Hydro, Open-Meteo, and OpenStreetMap (Overpass API).',
      'Requests to Environment and Climate Change Canada and Open-Meteo include coordinates rounded to about 1 km (your GPS area, or the centre of the area you picked). Other requests contain no location. Like any website, these services can see your IP address when your device connects to them; their own privacy policies apply.',
      'Maps are displayed with Google Maps on Android and Apple Maps on iOS, which are governed by Google’s and Apple’s privacy policies.',
    ],
  },
  {
    heading: 'Notifications',
    paragraphs: [
      'High-risk alerts are off unless you turn them on. When on, the app periodically checks public data for the area you selected and shows a local notification if a category turns high. MOSI does not use push notification servers.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'MOSI is a general-audience app and is not directed to children under 13. It does not knowingly collect personal information from anyone.',
    ],
  },
  {
    heading: 'Your choices',
    paragraphs: [
      'You can turn location or notifications off at any time in your phone settings or in MOSI’s Settings tab. You can clear everything MOSI stores by clearing the app’s storage or uninstalling it. Because MOSI holds no data about you on any server, there is nothing else to request or delete.',
    ],
  },
  {
    heading: 'Changes and contact',
    paragraphs: [
      'If this policy changes, the updated version will be posted in the app and at the policy URL with a new date.',
      `Questions: ${SUPPORT_EMAIL}`,
    ],
  },
];

export const TERMS_OF_USE: LegalSection[] = [
  {
    heading: 'Not an emergency service',
    paragraphs: [
      SAFETY_NOTICE,
      'MOSI does not replace official alerting systems such as Alert Ready, Environment Canada warnings, or instructions from emergency officials, and it does not provide medical advice. Talk to a health professional about your own health.',
    ],
  },
  {
    heading: 'Independence',
    paragraphs: [
      INDEPENDENCE_NOTICE,
      'Data is used under the Open Government Licence – Canada, the Open Government Licence – Manitoba, CC BY 4.0 (Open-Meteo), and the ODbL (© OpenStreetMap contributors). Source names and links are listed in the app.',
    ],
  },
  {
    heading: 'How the score works',
    paragraphs: [
      'The MOSI score is a weighted model built by the developer from public data. Some categories (for example, ticks and mosquitoes) are estimates based on season, weather, and region rather than direct measurements.',
    ],
  },
  {
    heading: 'No warranty',
    paragraphs: [
      'MOSI is provided “as is”, free of charge, without warranties of any kind. To the extent permitted by law, the developer is not liable for decisions made or losses arising from use of the app.',
    ],
  },
];
