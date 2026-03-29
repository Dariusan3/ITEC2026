import JSZip from "jszip";
import { ydoc } from "./yjs";
import { validateWorkspaceSize } from "./workspaceLimits";

const BLOCKED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".vite",
  ".turbo",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
]);

/** Maximum file size per file on import (text). */
const MAX_FILE_BYTES = 400_000;

const EXT_TO_LANG = {
  js: "javascript",
  jsx: "react-jsx",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  html: "html",
  css: "css",
  scss: "css",
  json: "json",
  md: "markdown",
  mdx: "markdown",
};

/**
 * Monaco language for `yFiles` meta — aligned with FileTree.
 * @param {string} filename
 */
export function guessLanguageFromPath(filename) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || "javascript";
}

/** @param {string} p */
export function isSafeImportRelPath(p) {
  if (!p || typeof p !== "string") return false;
  const norm = p.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = norm.split("/").filter(Boolean);
  for (const seg of parts) {
    if (seg === "..") return false;
    if (BLOCKED_SEGMENTS.has(seg.toLowerCase())) return false;
  }
  return parts.length > 0;
}

/**
 * @param {Blob} blob
 * @returns {Promise<string|null>}
 */
async function readBlobAsUtf8Text(blob) {
  const buf = await blob.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) return null;
  const u8 = new Uint8Array(buf);
  const scan = Math.min(u8.length, 12_000);
  for (let i = 0; i < scan; i++) {
    if (u8[i] === 0) return null;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(u8);
}

/**
 * @param {FileList|File[]} fileList
 * @returns {Promise<Record<string, string>>}
 */
export async function filesFromDirectoryInput(fileList) {
  const out = {};
  const list = Array.from(fileList || []);
  for (const file of list) {
    const rel = (file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
    if (!rel || !isSafeImportRelPath(rel)) continue;
    const text = await readBlobAsUtf8Text(file);
    if (text == null) continue;
    out[rel] = text;
  }
  return out;
}

/**
 * @param {File} zipFile
 * @returns {Promise<Record<string, string>>}
 */
export async function filesFromZipFile(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);
  const out = {};
  const entries = Object.entries(zip.files);
  await Promise.all(
    entries.map(async ([rel, entry]) => {
      if (entry.dir) return;
      let path = rel.replace(/\\/g, "/");
      if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) return;
      if (!isSafeImportRelPath(path)) return;
      const blob = await entry.async("blob");
      const text = await readBlobAsUtf8Text(blob);
      if (text != null) out[path] = text;
    }),
  );
  return out;
}

/**
 * @param {import('yjs').Map<string, { language: string }>} yFiles
 * @param {(name: string) => import('yjs').Text} getYText
 * @param {Record<string, string>} filesRecord
 * @param {(path: string) => string} guessLang
 * @returns {{ ok: true, count: number } | { ok: false, error: string }}
 */
export function applyImportToWorkspace(yFiles, getYText, filesRecord, guessLang) {
  const keys = Object.keys(filesRecord);
  if (keys.length === 0) {
    return { ok: false, error: "No valid text files found to import." };
  }

  const merged = {};
  yFiles.forEach((_, name) => {
    merged[name] = getYText(name).toString();
  });
  for (const [path, content] of Object.entries(filesRecord)) {
    merged[path] = content;
  }
  const check = validateWorkspaceSize(merged);
  if (!check.ok) return { ok: false, error: check.error };

  ydoc.transact(() => {
    for (const [path, content] of Object.entries(filesRecord)) {
      const lang = guessLang(path);
      yFiles.set(path, { language: lang });
      const yt = getYText(path);
      if (yt.length > 0) yt.delete(0, yt.length);
      yt.insert(0, content);
    }
  });

  return { ok: true, count: keys.length };
}

/** From file paths, returns folder prefixes to open in the explorer. */
export function folderPrefixesFromPaths(paths) {
  const folders = new Set();
  for (const p of paths) {
    const parts = p.split("/");
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      folders.add(acc);
    }
  }
  return folders;
}
