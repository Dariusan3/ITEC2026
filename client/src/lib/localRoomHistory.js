const STORAGE_KEY = "itecify:history";

/** @typedef {{ id: string, visitedAt: number, label?: string, star?: boolean }} HistoryEntry */

/**
 * @returns {HistoryEntry[]}
 */
export function loadLocalHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((h) => h && typeof h.id === "string")
      .map((h) => ({
        id: h.id,
        visitedAt: Number(h.visitedAt) || 0,
        label: typeof h.label === "string" ? h.label : undefined,
        star: !!h.star,
      }));
  } catch {
    return [];
  }
}

/**
 * @param {HistoryEntry[]} entries
 */
export function saveLocalHistory(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 40)));
}

/**
 * @param {string} roomId
 * @param {boolean} star
 */
export function setRoomStarred(roomId, star) {
  const hist = loadLocalHistory();
  const i = hist.findIndex((h) => h.id === roomId);
  if (i >= 0) {
    hist[i] = { ...hist[i], star };
  } else {
    hist.unshift({ id: roomId, visitedAt: Date.now(), star });
  }
  saveLocalHistory(hist);
}

/**
 * @param {string} roomId
 * @param {string} label
 */
export function setRoomLabel(roomId, label) {
  const trimmed = label.trim().slice(0, 64);
  const hist = loadLocalHistory();
  const i = hist.findIndex((h) => h.id === roomId);
  if (i >= 0) {
    hist[i] = { ...hist[i], label: trimmed || undefined };
  } else {
    hist.unshift({ id: roomId, visitedAt: Date.now(), label: trimmed || undefined });
  }
  saveLocalHistory(hist);
}
