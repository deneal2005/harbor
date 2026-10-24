// Versioned localStorage persistence. Invalid or newer data is never silently wiped: the app
// shows a recovery screen and the owner chooses to export or reset.
import { SCHEMA_VERSION, STORAGE_KEY } from '../data/config.js';
import { buildSeed } from '../data/seed.js';

const REQUIRED = ['settings', 'business', 'customers', 'invoices', 'payments', 'adjustments', 'credits', 'expenses', 'history', 'bankTxns', 'imports', 'inbox', 'trail'];

export function validateState(s) {
  if (!s || typeof s !== 'object') return 'notObject';
  if (s.schemaVersion !== SCHEMA_VERSION) return 'version';
  for (const k of REQUIRED) if (s[k] === undefined) return `missing:${k}`;
  for (const k of REQUIRED.filter((k) => !['settings', 'business'].includes(k))) if (!Array.isArray(s[k])) return `type:${k}`;
  return null;
}

export function loadState(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: buildSeed(), status: 'unavailable' };
  }
  if (!raw) return { state: buildSeed(), status: 'fresh' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: null, status: 'corrupt', raw };
  }
  const problem = validateState(parsed);
  if (problem) return { state: null, status: 'invalid', problem, raw };
  return { state: parsed, status: 'loaded' };
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetState(storage = globalThis.localStorage) {
  const s = buildSeed();
  saveState(s, storage);
  return s;
}
