/**
 * Map meta "react-jsx" / extension → Monaco language (highlight + TS service).
 * @param {string} lang
 * @param {string} [filename]
 */
export function monacoLanguageFromMeta(lang, filename = "") {
  if (lang === "react-jsx") return "javascript";
  if (filename.endsWith(".tsx")) return "typescript";
  if (filename.endsWith(".jsx")) return "javascript";
  return lang;
}
