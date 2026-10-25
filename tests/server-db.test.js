// Data API against a real Postgres. Runs when DATABASE_URL is set (CI service container, or locally:
// docker run -p 5433:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=harbor postgres:16), skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/index.js';
import { seedDemo } from '../server/api.js';
import { LOCK_AFTER } from '../server/auth.js';
import { createPool, migrate, todayIST } from '../server/db.js';
import { buildSeed } from '../src/data/seed.js';

const url = process.env.DATABASE_URL;
const listen = (app) => new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const uniq = () => `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const many = { limit: 10000, windowMs: 60000 };

describe.skipIf(!url)('data API (Postgres)', () => {
  let pool, server, base;
  beforeAll(async () => {
    pool = createPool(url);
    await migrate(pool);
    server = await listen(createApp({ pool, dataLimits: { authLimit: many, payLimit: many } }));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { server?.close(); await pool?.end(); });

  // A tiny cookie-keeping client per owner.
  const client = () => {
    let cookie = '';
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, { method, headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(cookie && { cookie }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    };
    return { get: (p) => call('GET', p), post: (p, b = {}, h) => call('POST', p, b, h), action: (name, ...args) => call('POST', `/api/actions/${name}`, { args }) };
  };
  const signup = async () => {
    const c = client();
    const email = `${uniq()}@shop.example`;
    const r = await c.post('/api/auth/signup', { email, password: 'long-enough-pw' });
    expect(r.status).toBe(201);
    return Object.assign(c, { email });
  };
  const demo = async () => {
    const email = `${uniq()}@demo.example`;
    await seedDemo(pool, { email, password: 'demo-password' });
    const c = client();
    expect((await c.post('/api/auth/login', { email, password: 'demo-password' })).status).toBe(200);
    return c;
  };

  it('signup gives an empty ledger dated today, with an HttpOnly session cookie', async () => {
    const c = client();
    const r = await c.post('/api/auth/signup', { email: `${uniq()}@Shop.example `, password: 'long-enough-pw' });
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const { body } = await c.get('/api/state');
    expect(body.state.invoices).toEqual([]);
    expect(body.state.settings.demoDate).toBe(todayIST());
    expect(body.demo).toBe(false);
  });

  it('rejects weak passwords, duplicate emails and wrong passwords', async () => {
    const c = await signup();
    expect((await client().post('/api/auth/signup', { email: `${uniq()}@x.example`, password: 'short' })).body.error).toBe('weak');
    expect((await client().post('/api/auth/signup', { email: c.email, password: 'long-enough-pw' })).status).toBe(409);
    expect((await client().post('/api/auth/login', { email: c.email, password: 'wrong-password' })).status).toBe(401);
    expect((await client().post('/api/auth/login', { email: 'nobody@x.example', password: 'whatever-pw' })).status).toBe(401);
  });

  it('runs a named action, saves it, and leaves the ledger unchanged on a rule error', async () => {
    const c = await signup();
    const ok = await c.action('addCustomer', { name: 'Asha Traders', stateCode: '27' });
    expect(ok.status).toBe(200);
    expect(ok.body.customerId).toBeTruthy();
    const bad = await c.action('addCustomer', { name: 'Asha Traders', stateCode: '27' });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe('duplicateCustomer');
    const { body } = await c.get('/api/state');
    expect(body.state.customers.map((x) => x.name)).toEqual(['Asha Traders']);
    expect(body.state.trail.at(-1).type).toBe('customer-added');
  });

  it('refuses helpers, unknown actions and malformed arguments', async () => {
    const c = await signup();
    expect((await c.action('logEvent', 'x')).status).toBe(404);
    expect((await c.action('toString')).status).toBe(404);
    expect((await c.post('/api/actions/addCustomer', { args: 'nope' })).status).toBe(400);
    expect((await c.action('saveInvoice', { customerId: 'c1', lines: 'x' }, {})).status).toBe(422);
  });

  it('keeps each business to its own data', async () => {
    const a = await demo();
    const b = await signup();
    const invId = (await a.get('/api/state')).body.state.invoices.find((i) => i.status === 'issued').id;
    expect((await b.action('recordPayment', invId, { amountPaise: 100, date: todayIST() })).body.error).toBe('notFound');
    expect((await b.get('/api/state')).body.state.invoices).toEqual([]);
    expect((await client().get('/api/state')).status).toBe(401);
  });

  it('serializes concurrent writes from several devices', async () => {
    const c = await signup();
    const names = Array.from({ length: 8 }, (_, i) => `Customer ${i}`);
    const results = await Promise.all(names.map((name) => c.action('addCustomer', { name, stateCode: '27' })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const { body } = await c.get('/api/state');
    expect(body.state.customers.map((x) => x.name).sort()).toEqual(names);
    expect(new Set(body.state.customers.map((x) => x.id)).size).toBe(8);
    expect(body.version).toBe(9);
  });

  it('refuses an action built on an older copy of the ledger (another device saved first)', async () => {
    const c = await signup();
    const { version } = (await c.get('/api/state')).body;
    expect((await c.post('/api/actions/addCustomer', { args: [{ name: 'First', stateCode: '27' }], version })).status).toBe(200);
    const stale = await c.post('/api/actions/addCustomer', { args: [{ name: 'Second', stateCode: '27' }], version });
    expect(stale.status).toBe(409);
    expect(stale.body.state.customers.map((x) => x.name)).toEqual(['First']);
  });

  it('customer pay link shows one invoice only and records a claim for the owner', async () => {
    const owner = await demo();
    const { state } = (await owner.get('/api/state')).body;
    const inv = state.invoices.find((i) => i.token && !i.dispute && !i.claim && state.payments.every((p) => p.invoiceId !== i.id));
    const view = await client().get(`/api/pay/${inv.token}`);
    expect(view.status).toBe(200);
    expect(Object.keys(view.body).sort()).toEqual(['balancePaise', 'business', 'customerName', 'invoice', 'receivedPaise', 'today']);
    const others = state.customers.filter((x) => x.id !== inv.customerId).map((x) => x.name);
    expect(others.some((n) => JSON.stringify(view.body).includes(n))).toBe(false);
    expect(view.body.balancePaise).toBe(inv.totalPaise);

    const claim = await client().post(`/api/pay/${inv.token}/claim`, { reference: 'UTR123', date: state.settings.demoDate, amountPaise: 1000 });
    expect(claim.status).toBe(200);
    expect(claim.body.view.invoice.claimPending).toBe(true);
    const after = (await owner.get('/api/state')).body.state;
    expect(after.inbox.at(-1)).toMatchObject({ type: 'payment-report', invoiceId: inv.id, actor: 'customer' });
    expect((await client().get('/api/pay/not-a-token')).status).toBe(404);
    expect((await client().post(`/api/pay/${inv.token}/toString`, {})).status).toBe(404);
  });

  it('a newly issued invoice gets an unguessable, working pay link', async () => {
    const owner = await demo();
    const { state } = (await owner.get('/api/state')).body;
    const draft = state.invoices.find((i) => i.status === 'draft');
    const r = await owner.action('saveInvoice', { ...draft, lines: draft.lines }, { issue: true });
    expect(r.status).toBe(200);
    const inv = (await owner.get('/api/state')).body.state.invoices.find((i) => i.id === draft.id);
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await client().get(`/api/pay/${inv.token}`)).body.invoice.number).toBe(inv.number);
  });

  it('refuses cross-origin and non-JSON writes', async () => {
    const c = await signup();
    expect((await c.post('/api/actions/addCustomer', { args: [{ name: 'X', stateCode: '27' }] }, { origin: 'https://evil.example' })).status).toBe(403);
    const form = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    expect(form.status).toBe(415);
  });

  it('imports browser data into an empty ledger only; reset is demo-only', async () => {
    const c = await signup();
    expect((await c.post('/api/state/import', { state: { nope: 1 } })).status).toBe(400);
    expect((await c.post('/api/state/import', { state: buildSeed() })).status).toBe(200);
    expect((await c.get('/api/state')).body.state.invoices.length).toBeGreaterThan(0);
    expect((await c.post('/api/state/import', { state: buildSeed() })).status).toBe(409);
    expect((await c.post('/api/state/reset')).status).toBe(403);
    const d = await demo();
    expect((await d.post('/api/state/reset')).status).toBe(200);
  });

  it('logout ends the session', async () => {
    const c = await signup();
    expect((await c.get('/api/auth/me')).status).toBe(200);
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('locks an email after 5 wrong passwords, even with the right one, until 15 quiet minutes pass', async () => {
    const c = await signup();
    const unknown = `${uniq()}@nobody.example`;
    for (let i = 0; i < LOCK_AFTER; i++) {
      expect((await client().post('/api/auth/login', { email: c.email, password: 'wrong-password' })).status).toBe(401);
      expect((await client().post('/api/auth/login', { email: unknown, password: 'wrong-password' })).status).toBe(401);
    }
    // Same answer for a real and an unknown email, so the lock does not reveal which accounts exist.
    expect((await client().post('/api/auth/login', { email: c.email, password: 'long-enough-pw' })).body).toEqual({ error: 'locked' });
    expect((await client().post('/api/auth/login', { email: unknown, password: 'long-enough-pw' })).body).toEqual({ error: 'locked' });
    expect((await client().post('/api/auth/login', { email: c.email.toUpperCase(), password: 'long-enough-pw' })).status).toBe(429);

    await pool.query("UPDATE login_failures SET last_at = now() - interval '16 minutes' WHERE email = $1", [c.email]);
    expect((await client().post('/api/auth/login', { email: c.email, password: 'long-enough-pw' })).status).toBe(200);
    expect((await pool.query('SELECT 1 FROM login_failures WHERE email = $1', [c.email])).rowCount).toBe(0);
  });

  it('a success clears the count, so occasional typos never add up to a lock', async () => {
    const c = await signup();
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < LOCK_AFTER - 1; i++) await client().post('/api/auth/login', { email: c.email, password: 'typo-password' });
      expect((await client().post('/api/auth/login', { email: c.email, password: 'long-enough-pw' })).status).toBe(200);
    }
  });

  it('deletes an account and all of its data only with the right password; never the demo', async () => {
    const c = await signup();
    await c.action('addCustomer', { name: 'Gone Traders', stateCode: '27' });
    const { rows: [o] } = await pool.query('SELECT business_id FROM owners WHERE email = $1', [c.email]);
    expect((await c.post('/api/account/delete', {})).status).toBe(403);
    expect((await c.post('/api/account/delete', { password: 'not-my-password' })).body).toEqual({ error: 'badPassword' });
    expect((await client().post('/api/account/delete', { password: 'long-enough-pw' })).status).toBe(401);
    expect((await c.post('/api/account/delete', { password: 'long-enough-pw' }, { origin: 'https://evil.example' })).status).toBe(403);

    const r = await c.post('/api/account/delete', { password: 'long-enough-pw' });
    expect(r.status).toBe(200);
    expect((await c.get('/api/state')).status).toBe(401);
    expect((await client().post('/api/auth/login', { email: c.email, password: 'long-enough-pw' })).status).toBe(401);
    for (const table of ['businesses', 'ledgers', 'pay_tokens']) {
      const col = table === 'businesses' ? 'id' : 'business_id';
      expect((await pool.query(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [o.business_id])).rowCount, table).toBe(0);
    }
    expect((await pool.query('SELECT 1 FROM owners WHERE email = $1', [c.email])).rowCount).toBe(0);
    // The email is free again for a new account.
    expect((await client().post('/api/auth/signup', { email: c.email, password: 'long-enough-pw' })).status).toBe(201);

    const d = await demo();
    expect((await d.post('/api/account/delete', { password: 'demo-password' })).body).toEqual({ error: 'demo-only' });
  });

  it('caps public pay-link bodies at 16 kB while ledger writes may stay large', async () => {
    const owner = await demo();
    const inv = (await owner.get('/api/state')).body.state.invoices.find((i) => i.token && i.status !== 'draft');
    const big = await client().post(`/api/pay/${inv.token}/message`, { message: 'x'.repeat(20000) });
    expect(big).toMatchObject({ status: 413, body: { error: 'too-large' } });
    expect((await client().post(`/api/pay/${inv.token}/message`, { message: 'Will pay Friday' })).status).toBe(200);
    expect((await owner.post('/api/actions/addCustomer', { args: [{ name: 'y'.repeat(20000), stateCode: '27' }] })).status).not.toBe(413);
  });
});
