# Production readiness review (24 Oct 2026)

**Status: READY WITH CONDITIONS.** Ready to run as a single-owner, single-browser app on Render. Not ready to hold real customers' financial data for multiple users (see the conditions below).

## Platform

- React 19 + Vite 8 SPA. All business data lives in the browser's `localStorage` (`marlo:v1`, versioned, with a recovery screen and JSON export). There are no accounts, no database and no server-side records.
- Express 5 server (`server/index.js`) serves the build and proxies one feature: the Render Workflow "cash-flow integrity check" (`workflows/main.js`). Secrets (`RENDER_API_KEY`) stay on the server.
- Deploys: Render web service (`render.yaml`, health check `/api/health`), plus a static GitHub Pages build (`VITE_STATIC=1`, no server).

## Baseline (before changes)

`npm test` 109/109 passed · `npm run lint` clean · `npm run build` OK · `npm audit --omit=dev` 0 vulnerabilities. The work already had input whitelisting, an idempotency key, a rate limit on starts, JSON errors without stack traces, and storage that does not wipe data silently.

## Findings and fixes

| # | Severity | Finding (evidence) | Fix | Verified by |
|---|---|---|---|---|
| 1 | Medium | `POST /api/integrity-check` answered **500** to wrongly shaped JSON such as `{"invoices":"abc"}`, `{"invoices":[null]}` or `lines: "x"`, because `minimizePayload` called `.map` on non-arrays. Reproduced with a probe script. | `minimizePayload` keeps only arrays of objects. Valid input gives the same output, so the workflow tasks behave as before. | New test: these payloads now get a 400. It fails on the old code. |
| 2 | Medium | No security headers. The ledger is in `localStorage`, so any injected script could read all of it. There was no frame protection either, and `/pay/:token` URLs could leak through the Referer header. | CSP (`script-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`), nosniff, `Referrer-Policy: no-referrer`, X-Frame-Options, HSTS, Permissions-Policy. No new dependency. | Test + browser: dashboard, forecast, invoices, settings, the print page (QR `data:` image, Google Fonts) and the integrity-check request all work, with no CSP violations. |
| 3 | Medium | Every page returned **500** when the install path contained a dot-directory (e.g. `~/.apps/harbor`), because `sendFile` rejects dotfile paths. Reproduced on the original code. Render's path is not affected. | `sendFile('index.html', { root: distDir })`. | Test now serves from a `.deploy` directory. |
| 4 | Low | `GET /api/integrity-check/:runId` calls the Render API on every request and had no limit. | Rate limit per IP: 120/min. The page polls every 2 s, which is 30/min. | New test (fails on the old code). |
| 5 | Low | No graceful shutdown. Render sends SIGTERM on each deploy, which cut off in-flight requests. | SIGTERM/SIGINT close the server, with a forced exit after 10 s. | **Not verified locally** (Windows has no real SIGTERM). Check it in the logs of the first Render deploy. |
| 6 | Low | Hashed `/assets` files were cached for 1 h, and `index.html` could be cached too. | `/assets/*` cached for 1 year (immutable); the app shell gets `no-cache`. | Test. |
| 7 | Low | CI only ran tests, and only after a push to `main` (`pages.yml`). Lint, build and audit never ran on PRs. | `.github/workflows/ci.yml`: lint, test, build, `npm audit --omit=dev --audit-level=high` on every push and PR. | Not run on GitHub yet. Each step passes locally. |

## Results after changes

`npm test` 112/112 (3 new; they were run against the original code and failed there) · lint clean · build OK · audit 0 vulnerabilities · browser check of the production build (`npm start`) passed. No regressions found.

## Conditions before handling real customer data (not fixed: they need product decisions)

1. **No server-side persistence or backup.** Data is lost if the browser storage is cleared. Export is manual (Settings). Real use needs either a backend with authentication or, at minimum, prompts to export regularly.
2. **No authentication.** Anyone with the URL gets their own blank or demo ledger. That is safe today only because no data is shared between users.
3. **`/pay/:token` works only in the owner's browser** (documented limit).
4. The **rate limiter is in memory, per instance.** Move it to Render Key Value if the service scales beyond one instance. Users behind one NAT share the 5 starts/min limit.
5. **Integrity check:** the real Render Workflow run is not verified here (no `RENDER_API_KEY` in this environment). It is covered only by tests with a fake client.
6. **Logging is stdout only**, with no error tracking. Add Sentry or similar if failures need alerts.
7. **Not tested:** load, Safari/iOS, screen readers, and the GitHub Pages build after these changes (the server headers do not apply there).
