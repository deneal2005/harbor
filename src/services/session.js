// Local-first session gate. Harbor keeps every record on the owner's own device,
// so the sign-in key lives there too: a PBKDF2 password digest in localStorage and a
// session mark in sessionStorage (cleared when the tab closes). No password is ever
// stored — not even obfuscated: only the salt and the derived digest leave this module.
//
// Storage is always a parameter (defaulting to the browser's own stores) so tests can
// pass stand-ins. Every function degrades safely when a store is missing or empty.

export const CREDENTIAL_KEY = 'harbor.credential.v1';
export const SESSION_KEY = 'harbor.session.v1';
export const MIN_PASSWORD_LENGTH = 8;
// The iteration count is stored with the digest, so raising it later does not
// strand old keys; verification follows whatever the key says.
export const DEFAULT_ITERATIONS = 120000;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isEmail(value) {
  const v = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function weakPassword(value) {
  return !value || String(value).length < MIN_PASSWORD_LENGTH;
}

const safeStorage = (store) => (store && typeof store.getItem === 'function' ? store : null);

const readJson = (store, key) => {
  const s = safeStorage(store);
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeJson = (store, key, value) => {
  const s = safeStorage(store);
  if (!s) return false;
  try { s.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

const encode = (text) => new TextEncoder().encode(text);
const b64 = (buf) => {
  let s = '';
  for (const byte of new Uint8Array(buf)) s += String.fromCharCode(byte);
  return btoa(s);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Digest the password with PBKDF2-SHA256. 120k iterations keeps the key derivation
// around a third of a second on ordinary phones: slow enough to discourage offline
// guessing, short enough to stay invisible in the sign-in flow.
export async function digestPassword(password, { saltB64, iterations = DEFAULT_ITERATIONS, cryptoObj = globalThis.crypto } = {}) {
  if (!cryptoObj || !cryptoObj.subtle) throw new Error('crypto.subtle is unavailable (a secure context is required)');
  const salt = saltB64 ? unb64(saltB64) : cryptoObj.getRandomValues(new Uint8Array(16));
  const key = await cryptoObj.subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await cryptoObj.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { salt: b64(salt), hash: b64(bits), iterations };
}

// Byte-wise compare; length difference returns immediately (length is not a secret here).
const sameDigest = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

/* ------------------------------------------------------------------ credential */

export function credentialExists(storage = globalThis.localStorage) {
  const cred = readJson(storage, CREDENTIAL_KEY);
  return !!(cred && typeof cred.email === 'string' && typeof cred.hash === 'string');
}

export function credentialEmail(storage = globalThis.localStorage) {
  const cred = readJson(storage, CREDENTIAL_KEY);
  return cred && typeof cred.email === 'string' ? cred.email : null;
}

// First-run setup: creates the key that later sign-ins check against.
export async function createCredential({ email, password }, {
  storage = globalThis.localStorage,
  cryptoObj = globalThis.crypto,
  iterations = DEFAULT_ITERATIONS,
} = {}) {
  const clean = normalizeEmail(email);
  if (!isEmail(clean)) return { ok: false, error: 'email' };
  const pass = String(password ?? '');
  if (weakPassword(pass)) return { ok: false, error: 'weak' };
  if (credentialExists(storage)) return { ok: false, error: 'exists' };
  const { salt, hash, iterations: used } = await digestPassword(pass, { cryptoObj, iterations });
  const cred = { email: clean, salt, hash, iterations: used };
  if (!writeJson(storage, CREDENTIAL_KEY, cred)) return { ok: false, error: 'storage' };
  return { ok: true, email: clean };
}

export async function verifyCredential(email, password, {
  storage = globalThis.localStorage,
  cryptoObj = globalThis.crypto,
} = {}) {
  const cred = readJson(storage, CREDENTIAL_KEY);
  if (!cred || typeof cred.hash !== 'string' || typeof cred.salt !== 'string') return false;
  // The key belongs to one identity envelope: the email has to match as well,
  // otherwise the right password would pass for any address.
  if (normalizeEmail(cred.email) !== normalizeEmail(email)) return false;
  const { hash } = await digestPassword(String(password ?? ''), { saltB64: cred.salt, iterations: cred.iterations || DEFAULT_ITERATIONS, cryptoObj });
  return sameDigest(unb64(hash), unb64(cred.hash));
}

export async function signIn(email, password, {
  storage = globalThis.localStorage,
  sessionStorage,
  ...options
} = {}) {
  if (!credentialExists(storage)) return { ok: false, error: 'noCredential' };
  if (!(await verifyCredential(normalizeEmail(email), password, { storage, ...options }))) {
    return { ok: false, error: 'badLogin' };
  }
  startSession(normalizeEmail(email), { storage: sessionStorage });
  return { ok: true, email: normalizeEmail(email) };
}

// "Forgot password" for a device-held key: the honest fix is removing the key so
// first-run setup can create a new one. Stored business data is never touched.
export function removeCredential(storage = globalThis.localStorage) {
  const s = safeStorage(storage);
  if (!s) return false;
  try { s.removeItem(CREDENTIAL_KEY); return true; } catch { return false; }
}

/* --------------------------------------------------------------------- session */

// Session cache. Everything goes through subscribe/getSnapshot so components can
// read it with useSyncExternalStore and stay in step wherever they live.
const listeners = new Set();
let snapshot = readSession() ?? { signedIn: false, email: null };

function readSession(storage = globalThis.sessionStorage) {
  const s = safeStorage(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.email !== 'string') return null;
    return { signedIn: true, email: parsed.email };
  } catch {
    return null;
  }
}

function publish(storage = globalThis.sessionStorage) {
  // The cache is restarted from the same store that changed, so tests (and any
  // future second tab) can never read a stale or wrong-source snapshot.
  snapshot = readSession(storage) ?? { signedIn: false, email: null };
  for (const fn of listeners) fn(snapshot);
}

export function startSession(email, { storage = globalThis.sessionStorage } = {}) {
  const clean = normalizeEmail(email);
  writeJson(storage, SESSION_KEY, { email: clean, at: Date.now() });
  publish(storage);
}

export function endSession({ storage = globalThis.sessionStorage } = {}) {
  const s = safeStorage(storage);
  if (s) { try { s.removeItem(SESSION_KEY); } catch { /* storage blocked; the session ends anyway */ } }
  publish(storage);
}

export function subscribeSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// getSnapshot must hand back the same reference until the state actually changes.
export function getSessionSnapshot() {
  return snapshot;
}
