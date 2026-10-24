// Translation look-up shared by the app runtime (store) and print documents.
// Resolution order: simple-language overlay (when enabled), the selected language
// dictionary, then English as fallback, then the raw key.
import en, { simple as simpleEn } from './en.js';
import hi, { simple as simpleHi } from './hi.js';

const DICTS = { en, hi };
const SIMPLE = { en: simpleEn, hi: simpleHi };

export function makeT(lang, simpleMode = false) {
  const dict = DICTS[lang] || en;
  const overlay = simpleMode ? (SIMPLE[lang] || {}) : {};
  return (key, vars = {}) => {
    const s = overlay[key] ?? dict[key] ?? en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  };
}
