/** Limită workspace trimis la preview (client + server). Aliniat cu body limit Express. */
export const MAX_WORKSPACE_BYTES = Number(
  import.meta.env.VITE_MAX_WORKSPACE_MB || 7,
) *
  1024 *
  1024;

/** Dimensiune maximă cod trimis la Run (un singur fișier) */
export const MAX_RUN_SOURCE_BYTES =
  Number(import.meta.env.VITE_MAX_RUN_SOURCE_MB || 2) * 1024 * 1024;

/**
 * @param {Record<string, string>} files
 * @returns {{ bytes: number, fileCount: number }}
 */
export function measureWorkspace(files) {
  let bytes = 0;
  let fileCount = 0;
  for (const [path, content] of Object.entries(files)) {
    fileCount += 1;
    bytes += new TextEncoder().encode(path).length;
    bytes += new TextEncoder().encode(String(content ?? "")).length;
  }
  return { bytes, fileCount };
}

/**
 * @param {Record<string, string>} files
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateWorkspaceSize(files, maxBytes = MAX_WORKSPACE_BYTES) {
  const { bytes } = measureWorkspace(files);
  if (bytes <= maxBytes) return { ok: true };
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
  return {
    ok: false,
    error: `Workspace prea mare (~${mb} MB). Limita este ${maxMb} MB (Preview/Run). Micșorează fișierele sau exclude build-uri.`,
  };
}
