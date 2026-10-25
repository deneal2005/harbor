// Owner accounts: scrypt password hashes and an HttpOnly session cookie whose sha256 is the
// sessions row key. The business an owner may touch always comes from the session, never the request.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const COOKIE = 'harbor_session';
const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, { N: 16384 });
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [kind, n, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n) });
  return timingSafeEqual(actual, expected);
}
// Compared against when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = await hashPassword('harbor-timing-equaliser');

const sha256 = (s) => createHash('sha256').update(s).digest();
const readCookie = (req) => (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);

export const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();

export function credentialsError({ email, password }, signup) {
  if (!EMAIL.test(normalizeEmail(email))) return 'email';
  if (typeof password !== 'string' || !password) return 'noPwd';
  if (signup && password.length < MIN_PASSWORD_LENGTH) return 'weak';
  if (password.length > 200) return 'weak';
  return null;
}

export async function startSession(pool, res, req, ownerId) {
  const token = randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM sessions WHERE owner_id = $1 AND expires_at < now()', [ownerId]);
  await pool.query(`INSERT INTO sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), ownerId]);
  // Secure whenever the request came over HTTPS (Render); plain http only on a developer's machine.
  res.cookie(COOKIE, token, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400000 });
}

export async function endSession(pool, req, res) {
  const token = readCookie(req);
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

export async function login(pool, email, password) {
  const { rows: [owner] } = await pool.query('SELECT id, business_id, password_hash FROM owners WHERE email = $1', [normalizeEmail(email)]);
  const ok = await verifyPassword(password, owner?.password_hash ?? DUMMY_HASH);
  return ok && owner ? owner : null;
}

// Sets req.owner = { id, businessId, email, demo } or answers 401.
export const requireOwner = (pool) => async (req, res, next) => {
  const token = readCookie(req);
  if (!token) return res.status(401).json({ error: 'signed-out' });
  const { rows: [row] } = await pool.query(
    `SELECT o.id, o.business_id, o.email, b.demo, s.expires_at FROM sessions s JOIN owners o ON o.id = s.owner_id
     JOIN businesses b ON b.id = o.business_id WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256(token)]);
  if (!row) return res.status(401).json({ error: 'signed-out' });
  // Sliding expiry, written at most once a day per session.
  if (row.expires_at - Date.now() < (SESSION_DAYS - 1) * 86400000) {
    await pool.query(`UPDATE sessions SET expires_at = now() + interval '${SESSION_DAYS} days' WHERE token_hash = $1`, [sha256(token)]);
  }
  req.owner = { id: row.id, businessId: row.business_id, email: row.email, demo: row.demo };
  next();
};

// CSRF: SameSite=Lax already keeps the cookie off cross-site POSTs; also refuse writes that are not
// JSON or that a browser marks as coming from another origin.
export function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.headers.host) return res.status(403).json({ error: 'cross-origin' });
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'json-required' }); // forms cannot send this cross-site
  next();
}
