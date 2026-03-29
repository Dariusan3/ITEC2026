/**
 * Detect documentation files from the Yjs `files` map.
 * @param {import('yjs').Map<string, unknown>} yFiles
 * @returns {string[]}
 */
export function listWorkspaceMarkdownPaths(yFiles) {
  const paths = [];
  yFiles.forEach((_, name) => {
    if (!name || name.endsWith(".gitkeep")) return;
    const lower = name.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".mdx")) paths.push(name);
  });
  return sortWorkspaceDocPaths(paths);
}

/** Root README and docs/ first, then alphabetical. */
function sortWorkspaceDocPaths(paths) {
  const priority = (p) => {
    const pl = p.toLowerCase();
    const slash = pl.lastIndexOf("/");
    const base = slash === -1 ? pl : pl.slice(slash + 1);
    if (base === "readme.md" || base === "readme.markdown") return 0;
    if (pl.startsWith("docs/")) return 1;
    return 2;
  };
  return [...paths].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}
