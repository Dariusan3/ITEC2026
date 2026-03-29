/**
 * Feature flags (Vite: VITE_*). Defaults keep current behaviour unless opted out.
 */
function envBool(name, defaultValue = false) {
  const v = import.meta.env[name];
  if (v === undefined || v === "") return defaultValue;
  return String(v).toLowerCase() === "true" || v === "1";
}

export const featureFlags = {
  /** Automatic file sync with preview when the iframe is active */
  livePreviewSync: envBool("VITE_LIVE_PREVIEW_SYNC", true),
  /** On empty room: default Vite+React project (instead of a single main.js) */
  defaultVitePreset: envBool("VITE_DEFAULT_VITE_PRESET", true),
};
