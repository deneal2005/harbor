// Owner session, held by the server: the browser only ever sees an HttpOnly cookie it cannot read.
// This module keeps a snapshot { checked, signedIn, email, demo } for useSyncExternalStore and
// talks to /api/auth/*. Validation here is for quick feedback; the server checks everything again.

export const MIN_PASSWORD_LENGTH = 8;
const LAST_EMAIL_KEY = 'harbor.lastEmail';

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function weakPassword(value) {
  return !value || String(value).length < MIN_PASSWORD_LENGTH;
}

// JSON POST/GET against this server. Network failures come back as { status: 0 }.
export async function api(path, body) {
  try {
    const res = await fetch(path, body === undefined ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, body: { error: 'offline' } };
  }
}

// The sign-in form remembers the last address typed on this device (convenience only, never a secret).
export function credentialEmail(storage = globalThis.localStorage) {
  try { return storage?.getItem(LAST_EMAIL_KEY) || null; } catch { return null; }
}
const rememberEmail = (email) => { try { globalThis.localStorage?.setItem(LAST_EMAIL_KEY, email); } catch { /* blocked storage: nothing to remember */ } };

/* --------------------------------------------------------------------- snapshot */

const listeners = new Set();
let snapshot = { checked: false, signedIn: false, email: null, demo: false };

function publish(next) {
  snapshot = next;
  for (const fn of listeners) fn(snapshot);
}
const signedIn = ({ email, demo }) => publish({ checked: true, signedIn: true, email, demo: !!demo });
const signedOut = () => publish({ checked: true, signedIn: false, email: null, demo: false });

export function subscribeSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// getSnapshot must hand back the same reference until the state actually changes.
export function getSessionSnapshot() {
  return snapshot;
}

// Ask the server whether the cookie is still good. Offline counts as signed out until it answers.
export async function checkSession() {
  const r = await api('/api/auth/me');
  if (r.status === 200) signedIn(r.body); else signedOut();
  return snapshot;
}

// The server ended the session (expired, or signed out on another tab): drop to the sign-in gate.
export const sessionLost = signedOut;

/* -------------------------------------------------------------- sign in / out */

const failure = (r) => ({ ok: false, error: r.status === 0 ? 'offline' : r.body.error || 'server' });

export async function createCredential({ email, password }) {
  const r = await api('/api/auth/signup', { email: normalizeEmail(email), password: String(password ?? '') });
  if (r.status !== 201) return failure(r);
  rememberEmail(r.body.email);
  signedIn(r.body);
  return { ok: true, email: r.body.email };
}

export async function signIn(email, password) {
  const r = await api('/api/auth/login', { email: normalizeEmail(email), password: String(password ?? '') });
  if (r.status !== 200) return failure(r);
  rememberEmail(r.body.email);
  signedIn(r.body);
  return { ok: true, email: r.body.email };
}

export async function endSession() {
  await api('/api/auth/logout', {});
  signedOut();
}
