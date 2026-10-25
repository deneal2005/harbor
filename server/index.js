// Harbor web service: serves the built SPA, the owner data API backed by Postgres (server/api.js),
// and the endpoints that start and read the Render Workflow cash-flow integrity check.
// Secrets (RENDER_API_KEY, DATABASE_URL) stay on this server.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { minimizePayload, shapeErrors } from '../src/services/audit.js';
import { dataRouter, seedDemo } from './api.js';
import { createPool, migrate } from './db.js';

const TASK = 'cash-flow-integrity-check';
const RUN_ID = /^[A-Za-z0-9_-]{4,80}$/;

// Each check starts paid Workflow runs, so cap starts per client IP.
// shortcut: in-memory, per process; move to Render Key Value if the service runs on several instances.
export function rateLimiter({ limit = 5, windowMs = 60000 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return res.status(429).json({ error: 'rate-limited' });
    recent.push(now);
    hits.set(req.ip, recent);
    // Bound memory: sweep expired hosts when the map grows, clear only under a true flood.
    if (hits.size > 2500) {
      for (const [ip, hist] of hits) if (!hist.some((t) => now - t < windowMs)) hits.delete(ip);
      if (hits.size > 10000) hits.clear(); // bound memory under a flood of distinct IPs
    }
    next();
  };
}

// An injected script would run with the owner's session and could read the whole ledger.
// Styles stay 'unsafe-inline' because React style props and Google Fonts need them; scripts do not.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', // /pay/:token links carry a token in the path
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=15552000',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
}

export function createApp({ workflows, workflowSlug, distDir, limit, statusLimit = { limit: 120, windowMs: 60000 }, pool, dataLimits } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render terminates TLS in front of the service; use the client IP
  app.use(securityHeaders);
  const configured = !!(workflows && workflowSlug);

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'marlo', workflowConfigured: configured, databaseConfigured: !!pool }));

  if (pool) app.use('/api', dataRouter(pool, { rateLimiter, ...dataLimits }));
  else app.use(['/api/auth', '/api/state', '/api/actions', '/api/pay'], (req, res) => res.status(503).json({ error: 'database-not-configured' }));

  app.post('/api/integrity-check', rateLimiter(limit), express.json({ limit: '1mb' }), async (req, res) => {
    if (!configured) return res.status(503).json({ error: 'workflow-not-configured' });
    const payload = minimizePayload(req.body);
    const problems = shapeErrors(payload);
    if (problems.length) return res.status(400).json({ error: 'invalid-payload', problems });
    // Same records within 24h -> Render returns the existing run instead of starting a duplicate.
    const idempotencyKey = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 40);
    try {
      const run = await workflows.startTask(`${workflowSlug}/${TASK}`, [payload], { idempotencyKey, signal: AbortSignal.timeout(15000) });
      res.status(202).json({ runId: run.taskRunId, idempotencyKey });
    } catch (e) {
      console.error('startTask failed:', e?.message);
      res.status(502).json({ error: 'workflow-start-failed', message: e?.name === 'TimeoutError' ? 'Render did not respond in time' : 'Render rejected the request' });
    }
  });

  // Each status read is a Render API call; the page polls every 2 s, so 120/min leaves headroom.
  app.get('/api/integrity-check/:runId', rateLimiter(statusLimit), async (req, res) => {
    if (!RUN_ID.test(req.params.runId)) return res.status(400).json({ error: 'invalid-run-id' });
    if (!configured) return res.status(503).json({ error: 'workflow-not-configured' });
    try {
      const run = await workflows.getTaskRun(req.params.runId);
      const status = run.status === 'completed' ? 'succeeded' : run.status;
      res.json({ runId: run.id, status, startedAt: run.startedAt ?? null, completedAt: run.completedAt ?? null,
        report: status === 'succeeded' ? (Array.isArray(run.results) ? run.results[0] : run.results) : null,
        error: status === 'failed' ? (run.error ?? 'Workflow run failed') : null });
    } catch (e) {
      console.error('getTaskRun failed:', e?.message);
      res.status(502).json({ error: 'workflow-status-failed' });
    }
  });

  // Unknown API paths (any method) answer as JSON 404, never the SPA shell or Express' HTML error
  // page. String mounts are required here: since Express 5, `app.use()` with a regular expression
  // no longer prefix-matches, so the previous `app.use(/^\/api(\/|$)/, ...)` never fired beyond
  // the exact path /api and browsers received an HTML "Cannot GET" 404.
  app.use('/api', (req, res) => res.status(404).json({ error: 'not-found' }));
  // Sibling paths such as /apiFoo are typos too: 404 as JSON, not an HTML 404 or the app shell.
  app.use((req, res, next) => (req.path.startsWith('/api') ? res.status(404).json({ error: 'not-found' }) : next()));

  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir, {
      index: false, maxAge: '1h',
      // Vite fingerprints everything under /assets, so those files never change at the same URL.
      setHeaders: (res, path) => { if (/[\\/]assets[\\/]/.test(path)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); },
    }));
    // SPA fallback so deep links such as /pay/:token survive a refresh; anything
    // starting with /api is answered above and must never return the shell.
    app.get(/^(?!\/api).*/, (req, res) => res.set('Cache-Control', 'no-cache').sendFile('index.html', { root: distDir }));
  }

  // Body-parse failures (e.g. malformed JSON on POST) must answer as a JSON 400 instead of
  // Express' default HTML error page, which leaks the raw stack trace to the client.
  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed' || err?.name === 'SyntaxError') return res.status(400).json({ error: 'invalid-json' });
    console.error('Request failed:', err?.name, err?.message);
    res.status(500).json({ error: 'server-error' });
  });
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let workflows = null;
  if (process.env.RENDER_API_KEY && process.env.WORKFLOW_SLUG) {
    const { Render } = await import('@renderinc/sdk');
    workflows = new Render().workflows;
  } else {
    console.warn('RENDER_API_KEY or WORKFLOW_SLUG not set: the integrity check will report "not configured".');
  }
  let pool = null;
  if (process.env.DATABASE_URL) {
    pool = createPool(process.env.DATABASE_URL);
    await migrate(pool);
    // A demo login for judges and the video: created once when DEMO_PASSWORD is set; `npm run db:seed-demo` resets it.
    if (process.env.DEMO_PASSWORD && !(await pool.query("SELECT 1 FROM owners WHERE email = 'demo@harbor.example'")).rowCount) {
      await seedDemo(pool, { password: process.env.DEMO_PASSWORD });
      console.log('Demo business created: demo@harbor.example');
    }
  } else {
    console.warn('DATABASE_URL not set: sign-in and saved data are unavailable.');
  }
  const port = Number(process.env.PORT) || 3000;
  const server = createApp({ workflows, workflowSlug: process.env.WORKFLOW_SLUG, distDir: join(root, 'dist'), pool })
    .listen(port, () => console.log(`Harbor listening on :${port}`));
  // Render sends SIGTERM on every deploy: finish in-flight requests, then exit.
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => {
    console.log(`${sig} received, closing`);
    server.close(() => (pool ? pool.end() : Promise.resolve()).finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
