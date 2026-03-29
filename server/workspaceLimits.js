const MAX_BYTES = Math.max(
  1,
  parseInt(process.env.MAX_WORKSPACE_BYTES || `${7 * 1024 * 1024}`, 10) || 0,
);

function measureWorkspace(files) {
  let bytes = 0;
  if (!files || typeof files !== "object") return { bytes: 0, fileCount: 0 };
  let fileCount = 0;
  for (const [path, content] of Object.entries(files)) {
    fileCount += 1;
    bytes += Buffer.byteLength(String(path), "utf8");
    bytes += Buffer.byteLength(String(content ?? ""), "utf8");
  }
  return { bytes, fileCount };
}

function assertWorkspaceWithinLimit(files, label = "workspace") {
  const { bytes, fileCount } = measureWorkspace(files);
  if (bytes <= MAX_BYTES) return { bytes, fileCount };
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const maxMb = (MAX_BYTES / (1024 * 1024)).toFixed(0);
  const err = new Error(
    `${label} prea mare (~${mb} MB, ${fileCount} fișiere). Limita server: ${maxMb} MB (MAX_WORKSPACE_BYTES).`,
  );
  err.status = 413;
  throw err;
}

module.exports = {
  MAX_WORKSPACE_BYTES: MAX_BYTES,
  measureWorkspace,
  assertWorkspaceWithinLimit,
};
