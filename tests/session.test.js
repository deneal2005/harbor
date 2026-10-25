import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PASSWORD_LENGTH, checkSession, createCredential, endSession, getSessionSnapshot, isEmail, normalizeEmail,
  signIn, subscribeSession, weakPassword,
} from '../src/services/session.js';

// Stand-in server: each call answers with the next queued { status, body }; requests are recorded.
const server = (...answers) => {
  const calls = [];
  vi.stubGlobal('fetch', async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
    const a = answers.shift();
    if (a === 'offline') throw new TypeError('Failed to fetch');
    return { status: a.status, json: async () => a.body };
  });
  return calls;
};
afterEach(() => vi.unstubAllGlobals());

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

describe('session — server sign in / sign out', () => {
  it('signs in through the server and publishes the snapshot', async () => {
    const calls = server({ status: 401, body: { error: 'badLogin' } }, { status: 200, body: { email: 'o@s.in', demo: false } });
    expect(await signIn(' O@S.in ', 'wrong-pass')).toEqual({ ok: false, error: 'badLogin' });
    const seen = [];
    const off = subscribeSession((s) => seen.push(s.signedIn));
    expect(await signIn('O@S.in', 'right-pass')).toEqual({ ok: true, email: 'o@s.in' });
    off();
    expect(calls[1]).toEqual({ path: '/api/auth/login', method: 'POST', body: { email: 'o@s.in', password: 'right-pass' } });
    expect(seen).toEqual([true]);
    expect(getSessionSnapshot()).toMatchObject({ checked: true, signedIn: true, email: 'o@s.in' });
  });

  it('reports an existing account and an unreachable server', async () => {
    server({ status: 409, body: { error: 'exists' } }, 'offline');
    expect(await createCredential({ email: 'o@s.in', password: 'long-enough' })).toEqual({ ok: false, error: 'exists' });
    expect(await createCredential({ email: 'o@s.in', password: 'long-enough' })).toEqual({ ok: false, error: 'offline' });
  });

  it('sign-out and an expired cookie both end the snapshot', async () => {
    server({ status: 200, body: { email: 'o@s.in', demo: true } }, { status: 200, body: { ok: true } }, { status: 401, body: {} });
    expect((await checkSession()).demo).toBe(true);
    await endSession();
    expect(getSessionSnapshot().signedIn).toBe(false);
    expect((await checkSession()).signedIn).toBe(false);
  });

  it('the snapshot is stable between publishes (safe for useSyncExternalStore)', async () => {
    const first = getSessionSnapshot();
    await Promise.resolve();
    expect(getSessionSnapshot()).toBe(first);
  });
});
