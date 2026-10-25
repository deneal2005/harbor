// Data API: owner auth, the owner's ledger, the named actions that change it, and the public
// customer pay view. Every change runs the same pure transition the browser runs.
import { randomBytes } from 'node:crypto';
import express from 'express';
import * as actions from '../src/services/actions.js';
import { buildEmpty, buildSeed } from '../src/data/seed.js';
import { adjustedOn, balanceOf, paidOn } from '../src/services/invoices.js';
import { validateState } from '../src/services/storage.js';
import { credentialsError, endSession, hashPassword, login, normalizeEmail, requireOwner, sameOrigin, startSession } from './auth.js';
import { inTransaction, readLedger, syncTokens, todayIST, withLedger } from './db.js';

// Actions the owner's browser may ask for by name. Helpers such as logEvent are deliberately absent.
const OWNER_ACTIONS = ['saveInvoice', 'addCustomer', 'logPrepared', 'markSent', 'resetStage', 'snooze', 'recordPromise', 'setStopped',
  'raiseDispute', 'resolveDispute', 'confirmClaim', 'rejectClaim', 'recordPayment', 'recordAdjustment', 'importTransactions',
  'refreshSuggestions', 'confirmTransaction', 'linkTransaction', 'setTransactionStatus', 'updateSettings', 'updateExpenses', 'updateBusiness'];

// Malformed arguments make a transition throw (e.g. lines.map on a string): that is a bad request, not a crash.
function apply(fn, state, args) {
  try {
    return fn(state, ...args);
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) return { state, error: 'invalid-args' };
    throw e;
  }
}

// Seed and pre-account browser data carry guessable tokens that would also collide across businesses:
// any whole ledger written here gets fresh 128-bit pay links.
const retoken = (state) => ({ ...state, invoices: state.invoices.map((i) => (i.token ? { ...i, token: randomBytes(16).toString('base64url') } : i)) });

const isEmptyLedger = (s) => ['customers', 'invoices', 'payments', 'bankTxns'].every((k) => s[k].length === 0);

// Only what the customer page shows: never the ledger, other invoices or other customers.
// The token must still be on the invoice, so links left over from a demo reset stop working.
function payView(state, { invoice_id: invoiceId, token }) {
  const inv = state.invoices.find((i) => i.id === invoiceId && i.token === token && i.status !== 'draft');
  if (!inv) return null;
  const b = state.business;
  return {
    business: { name: b.name, logo: b.logo, owner: b.owner, phone: b.phone, email: b.email, upiId: b.upiId, bank: b.bank, sample: !!b.sample },
    customerName: state.customers.find((c) => c.id === inv.customerId)?.name ?? '',
    invoice: { number: inv.number, date: inv.date, dueDate: inv.dueDate, totalPaise: inv.totalPaise, disputed: !!inv.dispute, claimPending: !!inv.claim },
    receivedPaise: paidOn(state, inv.id) + adjustedOn(state, inv.id),
    balancePaise: balanceOf(state, inv),
    today: state.settings.demoDate,
  };
}

export function dataRouter(pool, { rateLimiter, authLimit = { limit: 10, windowMs: 60000 }, payLimit = { limit: 20, windowMs: 60000 } }) {
  const r = express.Router();
  // Scoped to this router's paths so unknown /api paths still reach the JSON 404 in index.js.
  // Only ledger writes carry big bodies (browser import, logo). The public pay endpoints and sign-in stay small.
  r.use(['/state', '/actions'], express.json({ limit: '10mb' }));
  r.use(['/auth', '/account', '/pay'], express.json({ limit: '16kb' }));
  r.use(['/auth', '/account', '/state', '/actions', '/pay'], sameOrigin);
  const owner = requireOwner(pool);

  // ---- auth -------------------------------------------------------------------
  r.post('/auth/signup', rateLimiter(authLimit), async (req, res) => {
    const problem = credentialsError(req.body ?? {}, true);
    if (problem) return res.status(400).json({ error: problem });
    const email = normalizeEmail(req.body.email);
    const hash = await hashPassword(req.body.password);
    let ownerId;
    try {
      ownerId = await inTransaction(pool, async (c) => {
        const { rows: [b] } = await c.query('INSERT INTO businesses DEFAULT VALUES RETURNING id');
        const { rows: [o] } = await c.query('INSERT INTO owners (business_id, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [b.id, email, hash]);
        await c.query('INSERT INTO ledgers (business_id, state) VALUES ($1, $2)', [b.id, buildEmpty({ email, today: todayIST() })]);
        return o.id;
      });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'exists' });
      throw e;
    }
    await startSession(pool, res, req, ownerId);
    res.status(201).json({ email, demo: false });
  });

  r.post('/auth/login', rateLimiter(authLimit), async (req, res) => {
    if (credentialsError(req.body ?? {}, false)) return res.status(401).json({ error: 'badLogin' });
    const o = await login(pool, req.body.email, req.body.password);
    if (o?.locked) return res.status(429).json({ error: 'locked' });
    if (!o) return res.status(401).json({ error: 'badLogin' });
    await startSession(pool, res, req, o.id);
    const { rows: [b] } = await pool.query('SELECT demo FROM businesses WHERE id = $1', [o.business_id]);
    res.json({ email: normalizeEmail(req.body.email), demo: b.demo });
  });

  r.post('/auth/logout', async (req, res) => {
    await endSession(pool, req, res);
    res.json({ ok: true });
  });

  r.get('/auth/me', owner, (req, res) => res.json({ email: req.owner.email, demo: req.owner.demo }));

  // Permanently delete the owner's business: the password is asked again (and throttled like sign-in).
  // The cascade removes the owner, sessions, ledger and pay links. The shared demo login cannot be deleted.
  r.post('/account/delete', rateLimiter(authLimit), owner, async (req, res) => {
    if (req.owner.demo) return res.status(403).json({ error: 'demo-only' });
    const password = req.body?.password;
    if (credentialsError({ email: req.owner.email, password }, false)) return res.status(403).json({ error: 'badPassword' });
    const o = await login(pool, req.owner.email, password);
    if (o?.locked) return res.status(429).json({ error: 'locked' });
    if (!o) return res.status(403).json({ error: 'badPassword' });
    await pool.query('DELETE FROM businesses WHERE id = $1', [req.owner.businessId]);
    res.clearCookie('harbor_session', { path: '/' });
    res.json({ ok: true });
  });

  // ---- the owner's ledger ----------------------------------------------------------
  r.get('/state', owner, async (req, res) => {
    const l = await readLedger(pool, req.owner.businessId);
    if (!l) return res.status(404).json({ error: 'not-found' });
    res.set('Cache-Control', 'no-store').json(l);
  });

  r.post('/actions/:name', owner, async (req, res) => {
    const name = req.params.name;
    if (!OWNER_ACTIONS.includes(name)) return res.status(404).json({ error: 'not-found' });
    const args = req.body?.args;
    if (!Array.isArray(args)) return res.status(400).json({ error: 'invalid-args' });
    const expectVersion = Number.isInteger(req.body.version) ? req.body.version : undefined;
    const out = await withLedger(pool, req.owner.businessId, (s) => apply(actions[name], s, args), { expectVersion });
    if (!out) return res.status(404).json({ error: 'not-found' });
    res.status(out.error === 'stale' ? 409 : out.error ? 422 : 200).json(out);
  });

  // Move data saved in this browser before accounts existed. Only into an empty ledger, and only
  // a document that passes the same validation the app used on load.
  r.post('/state/import', owner, async (req, res) => {
    const incoming = req.body?.state;
    const problem = validateState(incoming);
    if (problem) return res.status(400).json({ error: 'invalid-state', problem });
    const out = await withLedger(pool, req.owner.businessId, (s) => (isEmptyLedger(s) ? { state: retoken(incoming) } : { state: s, error: 'notEmpty' }));
    res.status(out.error ? 409 : 200).json(out);
  });

  // Back to the sample data: the demo business only, a real business must never lose its books this way.
  r.post('/state/reset', owner, async (req, res) => {
    if (!req.owner.demo) return res.status(403).json({ error: 'demo-only' });
    const out = await withLedger(pool, req.owner.businessId, () => ({ state: retoken(buildSeed()) }));
    res.json(out);
  });

  // ---- customer pay link (no login) ------------------------------------------------
  const lookup = async (token) => {
    if (typeof token !== 'string' || token.length > 64) return null;
    const { rows: [t] } = await pool.query('SELECT business_id, invoice_id FROM pay_tokens WHERE token = $1', [token]);
    return t ? { ...t, token } : null;
  };

  r.get('/pay/:token', rateLimiter({ limit: 120, windowMs: 60000 }), async (req, res) => {
    const t = await lookup(req.params.token);
    const l = t && await readLedger(pool, t.business_id);
    const view = l && payView(l.state, t);
    if (!view) return res.status(404).json({ error: 'not-found' });
    res.set('Cache-Control', 'no-store').json(view);
  });

  const CUSTOMER = {
    claim: (s, id, b) => actions.customerClaim(s, id, { reference: b.reference, date: b.date, amountPaise: b.amountPaise }),
    dispute: (s, id, b) => actions.raiseDispute(s, id, b.reason, 'customer'),
    message: (s, id, b) => actions.customerMessage(s, id, b.message),
  };
  r.post('/pay/:token/:kind', rateLimiter(payLimit), async (req, res) => {
    const act = Object.hasOwn(CUSTOMER, req.params.kind) && CUSTOMER[req.params.kind];
    const t = act && await lookup(req.params.token);
    if (!t) return res.status(404).json({ error: 'not-found' });
    const body = req.body ?? {};
    const out = await withLedger(pool, t.business_id, (s) => (payView(s, t) ? apply(act, s, [t.invoice_id, body]) : { state: s, error: 'notFound' }));
    if (!out) return res.status(404).json({ error: 'not-found' });
    res.status(out.error ? 422 : 200).json({ error: out.error ?? null, view: payView(out.state, t) });
  });

  return r;
}

// Create (or replace) the demo business with the sample ledger; returns its login.
export async function seedDemo(pool, { email = 'demo@harbor.example', password }) {
  const hash = await hashPassword(password);
  return inTransaction(pool, async (c) => {
    await c.query('DELETE FROM businesses WHERE id IN (SELECT business_id FROM owners WHERE email = $1)', [email]);
    const { rows: [b] } = await c.query('INSERT INTO businesses (demo) VALUES (true) RETURNING id');
    await c.query('INSERT INTO owners (business_id, email, password_hash) VALUES ($1, $2, $3)', [b.id, email, hash]);
    const state = retoken(buildSeed());
    await c.query('INSERT INTO ledgers (business_id, state) VALUES ($1, $2)', [b.id, state]);
    await syncTokens(c, b.id, null, state);
    return { email, businessId: b.id };
  });
}
