/**
 * Feature flags (Vite: VITE_*). Defaults keep current behaviour unless opted out.
 */
function envBool(name, defaultValue = false) {
  const v = import.meta.env[name];
  if (v === undefined || v === "") return defaultValue;
  return String(v).toLowerCase() === "true" || v === "1";
}

export const featureFlags = {
  /** Sincronizare automată a fișierelor cu preview când iframe-ul e activ */
  livePreviewSync: envBool("VITE_LIVE_PREVIEW_SYNC", true),
  /** La cameră goală: proiect Vite+React implicit (în loc de main.js singur) */
  defaultVitePreset: envBool("VITE_DEFAULT_VITE_PRESET", true),
};
