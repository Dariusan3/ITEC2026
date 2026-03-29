import { yRoomMeta } from "./yjs";

/**
 * Initial seed for empty room — avoids circular import yjs → seed at load time.
 * @param {import('yjs').Map<string, unknown>} yFiles
 * @param {(name: string) => import('yjs').Text} getYText
 */
export async function applyDefaultRoomSeed(yFiles, getYText) {
  const { featureFlags } = await import("./featureFlags");
  const { mergeVitePreviewTemplate } = await import("./vitePreviewTemplate");

  if (featureFlags.defaultVitePreset) {
    mergeVitePreviewTemplate(yFiles, getYText);
  } else {
    yFiles.set("main.js", { language: "javascript" });
  }
  if (yRoomMeta.get("nodeVersion") == null) {
    yRoomMeta.set("nodeVersion", "20");
  }
}
