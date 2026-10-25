import { expect, it, describe } from 'vitest';
import {
  CREDENTIAL_KEY, MIN_PASSWORD_LENGTH, SESSION_KEY, createCredential, credentialEmail,
  credentialExists, endSession, getSessionSnapshot, isEmail, normalizeEmail, removeCredential,
  signIn, startSession, subscribeSession, verifyCredential, weakPassword,
} from '../src/services/session.js';

// Stand-in stores: the services take storage as a parameter so tests never touch real devices.
const makeStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    has: (k) => m.has(k),
  };
};
const CRYPTO = globalThis.crypto;
// Lower iterations in tests: the record stores the count, so the flow is unchanged.
const OPTS = (m) => ({ storage: m, cryptoObj: CRYPTO, iterations: 31000 });

describe('session — email and password hygiene', () => {
  it('normalises email casing and padding', () => {
    expect(normalizeEmail('  Owner@Shop.IN ')).toBe('owner@shop.in');
    expect(normalizeEmail(null)).toBe('');
  });
  it('rejects malformed email addresses', () => {
    expect(isEmail('owner@shop.in')).toBe(true);
    expect(isEmail('no-at-sign')).toBe(false);
    expect(isEmail('a b@c.in')).toBe(false);
  });
  it(`passwords shorter than ${MIN_PASSWORD_LENGTH} are too weak`, () => {
    expect(weakPassword('short')).toBe(true);
    expect(weakPassword('lo0ng.enough')).toBe(false);
    expect(weakPassword('')).toBe(true);
    expect(weakPassword(null)).toBe(true);
  });
});

describe('session — the device key', () => {
  it('creates the key on first run and denies a second one', async () => {
    const storage = makeStore();
    const ok = await createCredential({ email: 'Owner@Shop.in', password: 'harbor-pass' }, OPTS(storage));
    expect(ok).toEqual({ ok: true, email: 'owner@shop.in' });
    expect(credentialExists(storage)).toBe(true);
    expect(credentialEmail(storage)).toBe('owner@shop.in');
    const again = await createCredential({ email: 'x@y.in', password: 'harbor-pass' }, OPTS(storage));
    expect(again).toEqual({ ok: false, error: 'exists' });
  });

  it('stores only salt + digest: the password never lands in the record', async () => {
    const storage = makeStore();
    await createCredential({ email: 'o@s.in', password: 'secret-pass-9' }, OPTS(storage));
    const raw = storage.getItem(CREDENTIAL_KEY);
    expect(raw).not.toContain('secret-pass-9');
    const cred = JSON.parse(raw);
    expect(Object.keys(cred).sort()).toEqual(['email', 'hash', 'iterations', 'salt']);
    expect(cred.hash.length).toBeGreaterThan(20);
    expect(cred.salt.length).toBeGreaterThan(20);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const storage = makeStore();
    await createCredential({ email: 'o@s.in', password: 'right-pass' }, OPTS(storage));
    expect(await verifyCredential('o@s.in', 'right-pass', OPTS(storage))).toBe(true);
    expect(await verifyCredential('o@s.in', 'wrong-pass', OPTS(storage))).toBe(false);
    expect(await verifyCredential('other@s.in', 'right-pass', OPTS(storage))).toBe(false);
  });

  it('refuses weak, malformed or duplicate first-run inputs', async () => {
    const storage = makeStore();
    expect((await createCredential({ email: 'bad', password: 'long-pass' }, OPTS(storage))).error).toBe('email');
    expect((await createCredential({ email: 'o@s.in', password: 'tiny' }, OPTS(storage))).error).toBe('weak');
  });

  it('removing the key hands the device back to first-run setup', async () => {
    const storage = makeStore();
    await createCredential({ email: 'o@s.in', password: 'right-pass' }, OPTS(storage));
    expect(removeCredential(storage)).toBe(true);
    expect(credentialExists(storage)).toBe(false);
  });

  it('works with a blocked or missing store without throwing', async () => {
    expect(credentialExists(null)).toBe(false);
    expect(removeCredential(null)).toBe(false);
    await expect(createCredential({ email: 'o@s.in', password: 'long-pass' }, { storage: null, cryptoObj: CRYPTO })).resolves.toEqual({ ok: false, error: 'storage' });
  });
});

describe('session — sign in / sign out', () => {
  it('signs in with the right password and starts a session', async () => {
    const cred = makeStore(); const sess = makeStore();
    await createCredential({ email: 'O@S.in', password: 'right-pass' }, OPTS(cred));
    const bad = await signIn('O@S.in', 'wrong-pass', { ...OPTS(cred), sessionStorage: sess });
    expect(bad).toEqual({ ok: false, error: 'badLogin' });
    const good = await signIn('O@S.in', 'right-pass', { ...OPTS(cred), sessionStorage: sess });
    expect(good).toEqual({ ok: true, email: 'o@s.in' });
    expect(JSON.parse(sess.getItem(SESSION_KEY)).email).toBe('o@s.in');
  });

  it('reports a missing device key as noCredential', async () => {
    const bad = await signIn('O@S.in', 'right-pass', { storage: makeStore(), sessionStorage: makeStore(), cryptoObj: CRYPTO });
    expect(bad).toEqual({ ok: false, error: 'noCredential' });
  });

  it('ending the session clears the device record', () => {
    const sess = makeStore();
    startSession('o@s.in', { storage: sess });
    endSession({ storage: sess });
    expect(sess.getItem(SESSION_KEY)).toBe(null);
  });

  it('the published snapshot subscriptions fire on changes', () => {
    const sess = makeStore();
    const seen = [];
    const off = subscribeSession((snap) => seen.push(snap.signedIn));
    startSession('o@s.in', { storage: sess });
    endSession({ storage: sess });
    off();
    expect(seen).toEqual([true, false]);
    expect(getSessionSnapshot().signedIn).toBe(false);
  });

  it('the snapshot is stable between publishes (safe for useSyncExternalStore)', async () => {
    const first = getSessionSnapshot();
    await Promise.resolve();
    expect(getSessionSnapshot()).toBe(first);
  });
});
