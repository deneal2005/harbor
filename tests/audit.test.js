import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';
import { buildForecast } from '../src/services/forecasting.js';
import { buildAuditPayload, minimizePayload, runAuditLocally } from '../src/services/audit.js';
import { createApp } from '../server/index.js';

const payloadFor = (s) => buildAuditPayload(s, buildForecast(s, s.settings.demoDate));
const failed = (r) => r.checks.filter((c) => !c.passed).map((c) => c.id);

describe('integrity audit (same chain the workflow runs)', () => {
  it('passes every check on the seeded data and reports the real first breach', () => {
    const r = runAuditLocally(payloadFor(buildSeed()));
    expect(failed(r)).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.summary.firstBreach).toMatchObject({ week: 2, date: '2026-11-01', gapPaise: 89_715_00 });
  });
  it('sends no names, contacts, GSTINs, bank details or invoice numbers', () => {
    const json = JSON.stringify(payloadFor(buildSeed()));
    for (const leak of ['Deccan', 'Sharma', 'GSTIN', '27AAKFS', 'gstin', 'phone', 'email', 'INV/26-27', 'upi', 'Print colour']) expect(json).not.toContain(leak);
  });
  it('strips unexpected fields a client might add', () => {
    const p = minimizePayload({ ...payloadFor(buildSeed()), secret: 'x', business: { bufferPaise: 1, name: 'Real Co', bank: {} } });
    expect(p.secret).toBeUndefined();
    expect(p.business).toEqual({ bufferPaise: 1 });
  });
  it('flags missing or non-integer fields as blocking and skips the forecast', () => {
    const p = payloadFor(buildSeed());
    p.invoices[3].totalPaise = 123.45;
    const r = runAuditLocally(p);
    expect(r.passed).toBe(false);
    expect(failed(r)).toContain('fieldsPresent');
    expect(r.skippedForecast).toBe(true);
  });
  it('catches negative balances and tampered totals', () => {
    const p = payloadFor(buildSeed());
    p.payments.push({ invoiceId: p.payments[0].invoiceId, amountPaise: 5_00_000_00, date: '2026-10-19' });
    const i = p.invoices.find((x) => x.status !== 'draft' && x.totalPaise > 0 && !p.payments.some((y) => y.invoiceId === x.id));
    i.totalPaise += 100;
    const r = runAuditLocally(p);
    expect(failed(r)).toEqual(expect.arrayContaining(['noNegativeBalances', 'totalsRecompute']));
  });
  it('detects a screen that disagrees with the recomputation and duplicate imports', () => {
    const p = payloadFor(buildSeed());
    p.clientSummary.weeks[4].closing += 1;
    p.bankTxnIds = ['bt-1', 'bt-1'];
    expect(failed(runAuditLocally(p))).toEqual(expect.arrayContaining(['matchesScreen', 'noDuplicateImports']));
  });
});

describe('integrity-check API', () => {
  const fake = (over = {}) => ({
    calls: [],
    async startTask(slug, input, opts) { this.calls.push({ slug, input, opts }); return { taskRunId: 'trn-test123' }; },
    async getTaskRun(id) { return { id, status: 'succeeded', results: [runAuditLocally(this.calls[0].input[0])] }; },
    ...over,
  });
  let server; let base; let wf;
  const listen = (app) => new Promise((r) => { const s = app.listen(0, () => r(s)); });
  beforeAll(async () => { wf = fake(); server = await listen(createApp({ workflows: wf, workflowSlug: 'marlo-wf' })); base = `http://127.0.0.1:${server.address().port}`; });
  afterAll(() => server.close());
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('health reports workflow configuration', async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, service: 'marlo', workflowConfigured: true });
  });
  it('starts the real task slug with a minimised payload and idempotency key, then returns the report', async () => {
    const res = await post(`${base}/api/integrity-check`, { ...payloadFor(buildSeed()), extra: 'drop me' });
    expect(res.status).toBe(202);
    const { runId } = await res.json();
    expect(wf.calls[0].slug).toBe('marlo-wf/cash-flow-integrity-check');
    expect(wf.calls[0].input[0].extra).toBeUndefined();
    expect(wf.calls[0].opts.idempotencyKey).toMatch(/^[0-9a-f]{40}$/);
    const run = await (await fetch(`${base}/api/integrity-check/${runId}`)).json();
    expect(run).toMatchObject({ status: 'succeeded', report: { passed: true } });
  });
  it('duplicate submissions reuse the same idempotency key', async () => {
    await post(`${base}/api/integrity-check`, payloadFor(buildSeed()));
    const keys = wf.calls.map((c) => c.opts.idempotencyKey);
    expect(keys.at(-1)).toBe(keys[0]);
  });
  it('rejects an invalid payload before calling Render', async () => {
    const n = wf.calls.length;
    const res = await post(`${base}/api/integrity-check`, { demoDate: 'nope', invoices: [] });
    expect(res.status).toBe(400);
    expect(wf.calls.length).toBe(n);
    expect((await fetch(`${base}/api/integrity-check/bad id!`)).status).toBe(400);
  });
  it('reports start failures and failed runs without inventing a result', async () => {
    const app = createApp({ workflowSlug: 'w', workflows: fake({
      async startTask() { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; },
      async getTaskRun(id) { return { id, status: 'failed', error: 'Task crashed' }; },
    }) });
    const s = await listen(app);
    const b = `http://127.0.0.1:${s.address().port}`;
    const start = await post(`${b}/api/integrity-check`, payloadFor(buildSeed()));
    expect(start.status).toBe(502);
    expect((await start.json()).message).toMatch(/did not respond/);
    expect(await (await fetch(`${b}/api/integrity-check/trn-x123`)).json()).toMatchObject({ status: 'failed', report: null, error: 'Task crashed' });
    s.close();
  });
  it('says "not configured" instead of faking a run when no Render credentials exist', async () => {
    const s = await listen(createApp({}));
    const b = `http://127.0.0.1:${s.address().port}`;
    expect((await post(`${b}/api/integrity-check`, payloadFor(buildSeed()))).status).toBe(503);
    expect((await (await fetch(`${b}/api/health`)).json()).workflowConfigured).toBe(false);
    s.close();
  });
  it('caps integrity-check starts per client', async () => {
    const s = await listen(createApp({ workflowSlug: 'w', workflows: fake(), limit: { limit: 2, windowMs: 60000 } }));
    const b = `http://127.0.0.1:${s.address().port}`;
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await post(`${b}/api/integrity-check`, payloadFor(buildSeed()))).status);
    expect(codes).toEqual([202, 202, 429]);
    s.close();
  });
  it('serves the app shell for deep links but not for unknown API routes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'marlo-dist-'));
    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    const s = await listen(createApp({ distDir: dir }));
    const b = `http://127.0.0.1:${s.address().port}`;
    const page = await fetch(`${b}/pay/p0065030`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('id="root"');
    // Unknown API paths must answer as JSON 404, never Express' HTML error page or the shell.
    const api404 = await fetch(`${b}/api/nope`);
    expect(api404.status).toBe(404);
    expect(api404.headers.get('content-type')).toContain('application/json');
    expect(await api404.json()).toMatchObject({ error: 'not-found' });
    // A wrong method must not fall through to Express' HTML 404 either.
    const wrongMethod = await fetch(`${b}/api/health`, { method: 'DELETE' });
    expect(wrongMethod.status).toBe(404);
    expect(wrongMethod.headers.get('content-type')).toContain('application/json');
    // misspelled API paths must not quietly return the app shell (HTML 200)
    const typo = await fetch(`${b}/apiFoo`);
    expect(typo.status).toBe(404);
    expect(typo.headers.get('content-type')).toContain('application/json');
    expect((await typo.text())).not.toContain('id="root"');
    s.close();
  });
  it('answers malformed JSON bodies with a JSON 400 and no stack trace', async () => {
    const s = await listen(createApp({ workflowSlug: 'w', workflows: fake() }));
    const b = `http://127.0.0.1:${s.address().port}`;
    const res = await fetch(`${b}/api/integrity-check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toEqual({ error: 'invalid-json' });
    // the raw body text and the stack must not leak back to the client as HTML
    expect(res.headers.get('content-type')).not.toContain('text/html');
    s.close();
  });
  it('validates the run id before reporting the workflow as unconfigured', async () => {
    const s = await listen(createApp({}));
    const b = `http://127.0.0.1:${s.address().port}`;
    const bad = await fetch(`${b}/api/integrity-check/bad id!`);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid-run-id' });
    s.close();
  });
});
