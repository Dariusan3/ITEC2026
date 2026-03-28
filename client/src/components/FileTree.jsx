import { useState, useEffect, useRef } from "react";
import { yFiles, getYText } from "../lib/yjs";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  PlusIcon,
} from "./ui/Icons";
const LANG_ICONS = {
  javascript: { icon: "JS", color: "#d7f58d" },
  typescript: { icon: "TS", color: "#6fe3a3" },
  python: { icon: "PY", color: "#8ff7a7" },
  rust: { icon: "RS", color: "#9cecae" },
  go: { icon: "GO", color: "#74f0c2" },
  java: { icon: "JV", color: "#7edfb3" },
  c: { icon: "C", color: "#5ccf7f" },
  html: { icon: "HT", color: "#b8ffca" },
  css: { icon: "CS", color: "#74f0c2" },
  json: { icon: "{}", color: "#8ff7a7" },
};

const EXT_TO_LANG = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  html: "html",
  css: "css",
  json: "json",
};

const treeInputClass =
  "soft-card w-full rounded-2xl border px-3 py-2 text-xs font-medium outline-none transition-all duration-150 placeholder:text-[color:var(--text-secondary)] focus:-translate-y-px focus:shadow-[0_12px_24px_rgba(0,0,0,0.18)]";

const contextActionClass =
  "mx-1 flex w-[calc(100%-0.5rem)] items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-150 hover:bg-[color:var(--bg-tertiary)] hover:brightness-110";

function guessLang(filename) {
  const ext = filename.split(".").pop();
  return EXT_TO_LANG[ext] || "javascript";
}

function searchFiles(files, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const results = [];

  files.forEach((file) => {
    const nameMatch = file.name.toLowerCase().includes(needle);
    if (nameMatch) {
      results.push({
        id: `${file.name}:name`,
        file: file.name,
        language: file.language,
        line: 1,
        column: 1,
        kind: "file",
        preview: file.name,
      });
    }

    const lines = getYText(file.name).toString().split("\n");
    lines.forEach((lineText, index) => {
      const matchIndex = lineText.toLowerCase().indexOf(needle);
      if (matchIndex === -1) return;
      results.push({
        id: `${file.name}:${index + 1}:${matchIndex + 1}`,
        file: file.name,
        language: file.language,
        line: index + 1,
        column: matchIndex + 1,
        kind: "content",
        preview: lineText.trim() || "(empty line)",
      });
    });
  });

  return results.slice(0, 60);
}

/** Build a nested tree from flat paths like ["src/index.js", "main.js"] */
function buildTree(files) {
  const root = {};
  for (const { name, language } of files) {
    const parts = name.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (!node[part]) {
        node[part] = isFile
          ? { __file: true, path: name, language }
          : { __file: false, children: {} };
      }
      if (!isFile) node = node[part].children;
    }
  }
  return root;
}

function TreeNode({
  name,
  node,
  depth,
  activeFile,
  onFileSelect,
  onContextMenu,
  openFolders,
  toggleFolder,
  creatingIn,
  setCreatingIn,
  onMoveFile,
  dropHighlight,
  setDropHighlight,
}) {
  const isFile = node.__file;
  const indent = depth * 12;
  const isGitKeep = isFile && node.path?.endsWith(".gitkeep");

  if (isFile && isGitKeep) {
    return null;
  }

  if (isFile) {
    const icon = LANG_ICONS[node.language] || LANG_ICONS.javascript;
    const isActive = activeFile === node.path;
    return (
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("application/itecify-file", node.path);
        }}
        onClick={() => onFileSelect(node.path, node.language)}
        onContextMenu={(e) => onContextMenu(e, node.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFileSelect(node.path, node.language);
          }
        }}
        className="group flex cursor-grab active:cursor-grabbing items-center gap-2.5 rounded-2xl px-3 py-2 text-xs transition-all duration-150 hover:bg-[color:var(--bg-tertiary)]/78 hover:shadow-[0_10px_18px_rgba(0,0,0,0.12)]"
        style={{
          paddingLeft: indent + 8,
          background: isActive ? "color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))" : "transparent",
          color: "var(--text-primary)",
          boxShadow: isActive
            ? "inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, var(--border)), 0 12px 24px rgba(0,0,0,0.16)"
            : "none",
        }}
      >
        <span
          className="inline-flex min-w-[1.9rem] items-center justify-center rounded-xl px-2 py-1 text-[9px] font-bold tracking-[0.12em]"
          style={{
            color: icon.color,
            background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 80%, transparent), color-mix(in srgb, var(--bg-tertiary) 92%, transparent))",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--border) 86%, transparent), 0 8px 16px rgba(0,0,0,0.12)",
          }}
        >
          {icon.icon}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-semibold tracking-[0.01em]">{name}</span>
          <span
            className="block truncate text-[9px] uppercase tracking-[0.16em]"
            style={{ color: "var(--text-secondary)" }}
          >
            {node.language}
          </span>
        </div>
      </div>
    );
  }

  // Folder node
  const folderPath = node.__folderPath;
  const isOpen = openFolders.has(folderPath);
  const isDropTarget = dropHighlight === folderPath;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleFolder(folderPath)}
        onContextMenu={(e) => onContextMenu(e, null, folderPath)}
        onKeyDown={(e) => {
          if (e.key === "Enter") toggleFolder(folderPath);
        }}
        onDragOver={(e) => {
          if (
            Array.from(e.dataTransfer.types || []).some(
              (t) => t === "application/itecify-file" || t === "text/plain",
            )
          ) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setDropHighlight(folderPath);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setDropHighlight((h) => (h === folderPath ? null : h));
          }
        }}
        onDrop={(e) => {
          const types = Array.from(e.dataTransfer.types || []);
          if (!types.some((t) => t === "application/itecify-file" || t === "text/plain")) return;
          e.preventDefault();
          e.stopPropagation();
          setDropHighlight(null);
          const from =
            e.dataTransfer.getData("application/itecify-file") ||
            e.dataTransfer.getData("text/plain");
          if (from) onMoveFile(from, folderPath);
        }}
        className="group flex cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2 text-xs transition-all duration-150 hover:bg-[color:var(--bg-tertiary)]/72 hover:shadow-[0_10px_18px_rgba(0,0,0,0.12)]"
        style={{
          paddingLeft: indent + 8,
          color: "var(--text-secondary)",
          outline: isDropTarget ? "2px dashed var(--accent)" : "none",
          outlineOffset: 1,
          background: isDropTarget ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
        }}
      >
        {isOpen ? (
          <ChevronDownIcon className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 shrink-0" />
        )}
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, var(--bg-primary)), color-mix(in srgb, var(--bg-tertiary) 88%, transparent))",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, var(--border)), 0 8px 16px rgba(0,0,0,0.12)",
          }}
        >
          <FolderIcon className="h-3.5 w-3.5 shrink-0" stroke="var(--accent)" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-semibold tracking-[0.01em]">{name}</span>
          <span
            className="block truncate text-[9px] uppercase tracking-[0.16em]"
            style={{ color: "var(--text-secondary)" }}
          >
            Folder
          </span>
        </div>
        <button
          type="button"
          title="New file in folder"
          onClick={(e) => {
            e.stopPropagation();
            setCreatingIn(folderPath);
          }}
          className="liquid-surface opacity-0 group-hover:opacity-100 rounded-xl border p-1.5 transition-all duration-150 hover:-translate-y-px hover:opacity-100"
          style={{
            color: "var(--accent)",
            borderColor: "color-mix(in srgb, var(--accent) 18%, var(--border))",
            background: "color-mix(in srgb, var(--accent) 10%, var(--bg-primary))",
          }}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {isOpen && (
        <div>
          {Object.entries(node.children)
            .filter(([, child]) => !(child.__file && child.path?.endsWith(".gitkeep")))
            .sort(([, a], [, b]) => {
              if (!a.__file && b.__file) return -1;
              if (a.__file && !b.__file) return 1;
              return 0;
            })
            .map(([childName, childNode]) => (
              <TreeNode
                key={childName}
                name={childName}
                node={childNode}
                depth={depth + 1}
                activeFile={activeFile}
                onFileSelect={onFileSelect}
                onContextMenu={onContextMenu}
                openFolders={openFolders}
                toggleFolder={toggleFolder}
                creatingIn={creatingIn}
                setCreatingIn={setCreatingIn}
                onMoveFile={onMoveFile}
                dropHighlight={dropHighlight}
                setDropHighlight={setDropHighlight}
              />
            ))}
          {creatingIn === folderPath && null /* handled by parent */}
        </div>
      )}
    </div>
  );
}

const explorerBtnClass =
  "liquid-surface inline-flex h-full items-center justify-center rounded-2xl border px-2.5 py-1.5 font-mono text-[10px] font-bold leading-none shadow-[0_10px_20px_rgba(0,0,0,0.14)] transition-all duration-150 hover:-translate-y-px hover:brightness-110 active:scale-[0.93] sm:px-3 sm:py-1.5 sm:text-[11px]";

export default function FileTree({ activeFile, onFileSelect }) {
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingIn, setCreatingIn] = useState(null);
  const [renamingFile, setRenamingFile] = useState(null);
  const [renameTo, setRenameTo] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [openFolders, setOpenFolders] = useState(new Set());
  /** null | "" (root) | folder path — highlight drop target while dragging */
  const [dropHighlight, setDropHighlight] = useState(null);
  const newInputRef = useRef(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    const update = () => {
      const list = [];
      yFiles.forEach((meta, name) => list.push({ name, ...meta }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setFiles(list);
    };
    yFiles.observe(update);
    update();
    return () => yFiles.unobserve(update);
  }, []);

  useEffect(() => {
    if (creating || creatingIn !== null) newInputRef.current?.focus();
  }, [creating, creatingIn]);

  useEffect(() => {
    if (renamingFile) renameInputRef.current?.focus();
  }, [renamingFile]);

  const toggleFolder = (folderPath) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const createFile = () => {
    let trimmed = newName.trim();
    if (!trimmed) {
      setCreating(false);
      setCreatingIn(null);
      setNewName("");
      return;
    }
    if (creatingIn) trimmed = `${creatingIn}/${trimmed}`;
    if (yFiles.has(trimmed)) {
      alert(`"${trimmed}" already exists`);
      return;
    }
    const lang = guessLang(trimmed);
    yFiles.set(trimmed, { language: lang });
    getYText(trimmed);
    const parts = trimmed.split("/");
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join("/");
      setOpenFolders((prev) => new Set([...prev, folder]));
    }
    onFileSelect(trimmed, lang);
    setCreating(false);
    setCreatingIn(null);
    setNewName("");
  };

  const createFolder = () => {
    let trimmed = newName.trim();
    if (!trimmed) {
      setCreating(false);
      setCreatingIn(null);
      setNewName("");
      return;
    }
    const folderPath = creatingIn ? `${creatingIn}/${trimmed}` : trimmed;
    const placeholder = `${folderPath}/.gitkeep`;
    if (!yFiles.has(placeholder)) {
      yFiles.set(placeholder, { language: "json" });
      getYText(placeholder);
    }
    setOpenFolders((prev) => new Set([...prev, folderPath]));
    setCreating(false);
    setCreatingIn(null);
    setNewName("");
  };

  const [creatingFolder, setCreatingFolder] = useState(false);

  const startCreateFile = (folderPath = null) => {
    setCreatingFolder(false);
    setCreatingIn(folderPath);
    setCreating(true);
    setNewName("");
  };

  const startCreateFolder = () => {
    setCreatingFolder(true);
    setCreatingIn(null);
    setCreating(true);
    setNewName("");
  };

  const handleCreate = () => {
    if (creatingFolder) createFolder();
    else createFile();
  };

  /** Mută fișierul într-un folder (targetFolder gol = rădăcină). */
  const moveFile = (fromPath, targetFolder) => {
    if (!fromPath || fromPath.endsWith(".gitkeep")) return;
    const norm = targetFolder ? String(targetFolder).replace(/\/+$/, "") : "";
    const base = fromPath.split("/").pop();
    const newPath = norm ? `${norm}/${base}` : base;
    if (fromPath === newPath) return;
    if (yFiles.has(newPath)) {
      alert(`"${newPath}" există deja`);
      return;
    }
    const meta = yFiles.get(fromPath);
    if (!meta) return;
    const text = getYText(fromPath).toString();
    yFiles.delete(fromPath);
    yFiles.set(newPath, { language: meta.language ?? guessLang(newPath) });
    const yNew = getYText(newPath);
    if (text.length > 0) yNew.insert(0, text);
    const yOld = getYText(fromPath);
    if (yOld.length > 0) yOld.delete(0, yOld.length);
    if (activeFile === fromPath) onFileSelect(newPath, yFiles.get(newPath).language);
    if (norm) {
      setOpenFolders((prev) => {
        const next = new Set(prev);
        next.add(norm);
        let prefix = "";
        for (const part of norm.split("/")) {
          prefix = prefix ? `${prefix}/${part}` : part;
          next.add(prefix);
        }
        return next;
      });
    }
  };

  const renameFile = () => {
    const trimmed = renameTo.trim();
    if (!trimmed || trimmed === renamingFile) {
      setRenamingFile(null);
      return;
    }
    if (yFiles.has(trimmed)) {
      alert(`"${trimmed}" already exists`);
      return;
    }
    const oldText = getYText(renamingFile).toString();
    const lang = guessLang(trimmed);
    yFiles.delete(renamingFile);
    yFiles.set(trimmed, { language: lang });
    if (oldText) getYText(trimmed).insert(0, oldText);
    if (activeFile === renamingFile) onFileSelect(trimmed, lang);
    setRenamingFile(null);
    setRenameTo("");
  };

  const deleteFile = (filename) => {
    const nonKeep = [...yFiles.keys()].filter((k) => !k.endsWith(".gitkeep"));
    if (nonKeep.length <= 1 && !filename.endsWith(".gitkeep")) {
      alert("Cannot delete the last file");
      return;
    }
    if (!confirm(`Delete "${filename}"?`)) return;
    yFiles.delete(filename);
    if (activeFile === filename) {
      const remaining = [];
      yFiles.forEach((_, n) => {
        if (!n.endsWith(".gitkeep")) remaining.push(n);
      });
      if (remaining.length > 0)
        onFileSelect(remaining[0], yFiles.get(remaining[0]).language);
    }
  };

  const deleteFolder = (folderPath) => {
    const children = [...yFiles.keys()].filter((k) =>
      k.startsWith(folderPath + "/"),
    );
    if (
      !confirm(
        `Delete folder "${folderPath}" and all ${children.length} file(s)?`,
      )
    )
      return;
    children.forEach((k) => yFiles.delete(k));
    if (children.includes(activeFile)) {
      const remaining = [...yFiles.keys()].filter((k) => !k.endsWith(".gitkeep"));
      if (remaining.length > 0)
        onFileSelect(remaining[0], yFiles.get(remaining[0]).language);
    }
  };

  const openContextMenu = (e, filename, folderPath = null) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, filename, folderPath });
  };

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  function buildTreeWithPaths(files) {
    const tree = buildTree(files);
    function annotate(node, path) {
      for (const [k, v] of Object.entries(node)) {
        if (!v.__file) {
          v.__folderPath = path ? `${path}/${k}` : k;
          annotate(v.children, v.__folderPath);
        }
      }
    }
    annotate(tree, "");
    return tree;
  }

  /* Include .gitkeep în arbore ca să apară foldere goale; rândul .gitkeep e ascuns în TreeNode */
  const tree = buildTreeWithPaths(files);
  const searchResults = searchFiles(files, searchQuery);
  const showingSearch = searchQuery.trim().length > 0;

  return (
    <div
      className="flex h-full w-64 min-w-64 flex-col select-none border-r"
      style={{
        borderColor: "var(--border)",
      }}
    >
      <div
        className="flex min-h-[3.5rem] shrink-0 items-center justify-between gap-2 border-b px-3.5 py-2.5 sm:gap-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <span
            className="block text-[11px] font-bold uppercase tracking-[0.16em] sm:text-xs"
            style={{ color: "var(--accent)" }}
          >
            Explorer
          </span>
          <span
            className="block pt-0.5 text-[9px] uppercase tracking-[0.18em]"
            style={{ color: "var(--text-secondary)" }}
          >
            Files
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => startCreateFile()}
            className={explorerBtnClass}
            style={{
              background: "var(--bg-tertiary)",
              borderColor: "var(--border)",
              color: "var(--accent)",
              minWidth: "2rem",
              minHeight: "1.75rem",
            }}
            title="New file"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={startCreateFolder}
            className={explorerBtnClass}
            style={{
              background: "var(--bg-tertiary)",
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
              minWidth: "2rem",
              minHeight: "1.75rem",
            }}
            title="New folder"
          >
            <FolderIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className="shrink-0 border-b px-2 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="rounded border px-2 py-1.5"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border)",
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find across files"
            className="w-full bg-transparent text-xs outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
        {showingSearch && (
          <p
            className="px-0.5 pt-1 text-[9px] uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div
        className="flex-1 space-y-0.5 overflow-y-auto px-1"
        onDragOver={(e) => {
          if (
            Array.from(e.dataTransfer.types || []).some(
              (t) => t === "application/itecify-file" || t === "text/plain",
            )
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropHighlight("");
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setDropHighlight((h) => (h === "" ? null : h));
        }}
        onDrop={(e) => {
          const types = Array.from(e.dataTransfer.types || []);
          if (!types.some((t) => t === "application/itecify-file" || t === "text/plain")) return;
          e.preventDefault();
          const from =
            e.dataTransfer.getData("application/itecify-file") ||
            e.dataTransfer.getData("text/plain");
          setDropHighlight(null);
          if (from) moveFile(from, "");
        }}
        style={
          dropHighlight === ""
            ? { boxShadow: "inset 0 0 0 2px var(--accent)" }
            : undefined
        }
      >
        {showingSearch ? (
          searchResults.length > 0 ? (
            <div className="space-y-1 py-1">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() =>
                    onFileSelect(result.file, result.language, {
                      line: result.line,
                      column: result.column,
                    })
                  }
                  className="w-full rounded border px-2 py-1.5 text-left transition-all hover:brightness-110"
                  style={{
                    background:
                      activeFile === result.file
                        ? "var(--bg-tertiary)"
                        : "transparent",
                    borderColor: "var(--border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate text-[10px] font-semibold"
                      style={{ color: "var(--accent)" }}
                    >
                      {result.file}
                    </span>
                    <span
                      className="shrink-0 text-[9px] uppercase tracking-wide"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {result.kind === "file" ? "file" : `L${result.line}`}
                    </span>
                  </div>
                  <p
                    className="truncate pt-0.5 text-[10px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {result.preview}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p
              className="px-2 py-3 text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              No matches found.
            </p>
          )
        ) : (
          Object.entries(tree)
            .filter(([, node]) => !(node.__file && node.path?.endsWith(".gitkeep")))
            .sort(([, a], [, b]) => {
              if (!a.__file && b.__file) return -1;
              if (a.__file && !b.__file) return 1;
              return 0;
            })
            .map(([name, node]) => {
              if (node.__file && renamingFile === node.path) {
                return (
                  <input
                    key={name}
                    ref={renameInputRef}
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    onBlur={renameFile}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameFile();
                      if (e.key === "Escape") setRenamingFile(null);
                    }}
                    className="w-full rounded px-2 py-1 text-xs outline-none"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--accent)",
                    }}
                  />
                );
              }
              return (
                <TreeNode
                  key={name}
                  name={name}
                  node={node}
                  depth={0}
                  activeFile={activeFile}
                  onFileSelect={onFileSelect}
                  onContextMenu={openContextMenu}
                  openFolders={openFolders}
                  toggleFolder={toggleFolder}
                  creatingIn={creatingIn}
                  setCreatingIn={(folder) => startCreateFile(folder)}
                  onMoveFile={moveFile}
                  dropHighlight={dropHighlight}
                  setDropHighlight={setDropHighlight}
                />
              );
            })
        )}

        {creating && (
          <div className="px-1">
            <input
              ref={newInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setCreatingIn(null);
                  setNewName("");
                }
              }}
              placeholder={
                creatingFolder
                  ? "folder-name"
                  : creatingIn
                    ? `${creatingIn}/filename.js`
                    : "filename.js"
              }
              className={treeInputClass}
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--accent)",
              }}
            />
            {creatingIn && (
              <p
                className="mt-1 px-1 text-[9px] uppercase tracking-[0.16em]"
                style={{ color: "var(--text-secondary)" }}
              >
                in {creatingIn}/
              </p>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="floating-panel fixed z-50 min-w-[11rem] py-1.5 text-xs"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.filename && (
            <>
              <button
                type="button"
                className={contextActionClass}
                style={{ color: "var(--text-primary)" }}
                onClick={() => {
                  setRenamingFile(contextMenu.filename);
                  setRenameTo(contextMenu.filename);
                  setContextMenu(null);
                }}
                >
                  <span>Rename</span>
                  <span style={{ color: "var(--text-secondary)" }}>Enter</span>
                </button>
              <button
                type="button"
                className={contextActionClass}
                style={{ color: "var(--text-secondary)" }}
                onClick={() => {
                  const f = contextMenu.filename;
                  const suggested = f.includes("/") ? f : `folder/${f}`;
                  const dest = window.prompt("Cale nouă (folder/fișier.ext):", suggested);
                  setContextMenu(null);
                  if (!dest || !dest.trim()) return;
                  const trimmed = dest.trim().replace(/\\/g, "/");
                  if (trimmed === f) return;
                  if (yFiles.has(trimmed)) {
                    alert(`"${trimmed}" există deja`);
                    return;
                  }
                  const meta = yFiles.get(f);
                  const text = getYText(f).toString();
                  yFiles.delete(f);
                  yFiles.set(trimmed, { language: meta?.language ?? guessLang(trimmed) });
                  const yNew = getYText(trimmed);
                  if (text.length > 0) yNew.insert(0, text);
                  const yOld = getYText(f);
                  if (yOld.length > 0) yOld.delete(0, yOld.length);
                  if (activeFile === f) onFileSelect(trimmed, yFiles.get(trimmed).language);
                  const parent = trimmed.includes("/") ? trimmed.slice(0, trimmed.lastIndexOf("/")) : "";
                  if (parent) {
                    setOpenFolders((prev) => {
                      const next = new Set(prev);
                      let prefix = "";
                      for (const part of parent.split("/")) {
                        prefix = prefix ? `${prefix}/${part}` : part;
                        next.add(prefix);
                      }
                      return next;
                    });
                  }
                }}
              >
                Move to path…
              </button>
              <button
                type="button"
                className={contextActionClass}
                style={{ color: "var(--red)" }}
                onClick={() => {
                  deleteFile(contextMenu.filename);
                  setContextMenu(null);
                }}
                >
                  <span>Delete</span>
                  <span style={{ color: "color-mix(in srgb, var(--red) 80%, white)" }}>Del</span>
                </button>
            </>
          )}
          {contextMenu.folderPath && (
            <>
              <button
                type="button"
                className={contextActionClass}
                style={{ color: "var(--accent)" }}
                onClick={() => {
                  startCreateFile(contextMenu.folderPath);
                  setContextMenu(null);
                }}
                >
                  <span>New file here</span>
                  <span style={{ color: "var(--text-secondary)" }}>+</span>
                </button>
              <button
                type="button"
                className={contextActionClass}
                style={{ color: "var(--red)" }}
                onClick={() => {
                  deleteFolder(contextMenu.folderPath);
                  setContextMenu(null);
                }}
                >
                  <span>Delete folder</span>
                  <span style={{ color: "color-mix(in srgb, var(--red) 80%, white)" }}>Del</span>
                </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
