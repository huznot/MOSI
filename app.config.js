// Extends app.json with secrets that must not be committed.
// Android maps need a Google Maps SDK key (free for the Maps SDK for Android).
// Locally it comes from .env.local; for EAS builds, add it to EVERY environment you build:
//   eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment preview --visibility sensitive
//   eas env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment production --visibility sensitive
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const isEasAndroidBuild = process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM === 'android';

  if (!mapsKey) {
    // Without the key, Google Maps crashes the app as soon as the Map tab opens,
    // so refuse to produce such a build instead of shipping it.
    if (isEasAndroidBuild) {
      throw new Error(
        'GOOGLE_MAPS_ANDROID_API_KEY is missing for this EAS environment. Add it with `eas env:create` (see app.config.js).',
      );
    }
    console.warn('[app.config] GOOGLE_MAPS_ANDROID_API_KEY is not set - the Map tab will crash in Android builds.');
  }

  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: mapsKey }]],
  };
};
