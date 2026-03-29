/**
 * Extract the value of a string field from JSON-like text even if the full JSON is invalid
 * (e.g. the model forgets quotes around the "explanation" key).
 */
export function extractJsonStringField(text, field) {
  if (!text || typeof text !== "string") return null;
  const needle = `"${field}"`;
  const idx = text.indexOf(needle);
  if (idx === -1) return null;
  const after = text.slice(idx + needle.length);
  const colon = after.indexOf(":");
  if (colon === -1) return null;
  let rest = after.slice(colon + 1).trim();
  if (!rest.startsWith('"')) return null;
  let i = 1;
  let out = "";
  while (i < rest.length) {
    const c = rest[i];
    if (c === "\\" && i + 1 < rest.length) {
      const n = rest[i + 1];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === '"' || n === "\\" || n === "/") out += n;
      else if (n === "u" && i + 5 < rest.length) {
        const hex = rest.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        out += n;
      } else out += n;
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  return out;
}
