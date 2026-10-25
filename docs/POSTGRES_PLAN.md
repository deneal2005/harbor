# Plan: Postgres data layer and owner login

Status: **draft for review.** No code changes until this is approved.

## Goal

Replace browser localStorage with Render Postgres behind the existing Express server. Each owner signs
in and sees only their own business. Data persists, works on several devices, and is backed up.
The money rules (integer paise, `gst.js`, forecast invariants) stay exactly as they are, and the
existing vitest suite keeps covering them.

## The key idea: run the same pure actions on the server

`src/services/actions.js` is already a set of pure transitions `(state, ...args) -> { state } | { state, error }`,
and every write in the app goes through `run(action, ...args)` in `src/store.jsx`. So nothing gets
rewritten. The server imports the **same** `actions.js` (it already imports `src/services/audit.js`)
and runs it inside a database transaction:

```
POST /api/actions/:name   body: { args: [...] }
  BEGIN
  SELECT state FROM ledgers WHERE business_id = <session business> FOR UPDATE   -- one writer at a time
  r = actions[name](state, ...args)            -- same code, same validation, same paise rules
  if r.error -> ROLLBACK, 422 { error, ...extra }
  UPDATE ledgers SET state = r.state, version = version + 1
  COMMIT -> 200 { state: r.state, ...extra }   -- extra = invoiceId, customerId, added, skipped
```

- An allowlist maps `:name` to the exported action. Anything else is a 404. `logEvent` and helpers are not callable.
- The server is the trust boundary now. The client can never send a whole state. It can only ask for a named
  action, and that action does its own validation (it already does).
- Two devices writing at once are serialized by the row lock. The action runs against the latest state, so its
  own guards still apply (`alreadySent`, `claimPending`, `exceedsBalance`).
- The client `run()` becomes async: `await run(action, ...args)` returns the same `{ state, error }` shape and
  applies the returned state the way it does now. Callers already branch on `r.error`, so most call sites just
  gain an `await` (about 15 pages, mechanical).
- Other devices pick up changes on window focus and every 60 s (`GET /api/state`). No websockets in v1.

## Schema

```sql
CREATE TABLE businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,            -- stored lower-cased
  password_hash text NOT NULL,                   -- scrypt: salt$N$hash
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,                 -- sha256 of the cookie value; raw token never stored
  owner_id    uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);

-- The whole ledger of one business: business profile, customers, invoices, payments, reminders
-- (stored on each invoice), adjustments, credits, expenses, bank txns, inbox and the decision trail.
CREATE TABLE ledgers (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  state       jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Customer pay links: find the business for a link without scanning every ledger.
CREATE TABLE pay_tokens (
  token       text PRIMARY KEY,                  -- 128-bit random, base64url
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id  text NOT NULL
);
```

**Why one JSONB ledger per business instead of a table for each of customers, invoices, payments, reminders and trail:**
every action and every screen needs the whole ledger. `balanceOf` reads payments and adjustments, the forecast reads
everything, and the priority engine reads history. With normalized tables, every request would load all the rows into
the same state object, run the same action, then work out which rows changed and write them back. That is a lot of new
code between the money logic and the disk, and it is where rounding and ordering bugs would get in. The JSONB document
keeps exactly the shape that `validateState`, `actions.js` and the 125 tests already use.

- *Limit:* each action rewrites the whole document. A busy small business (a few thousand invoices, 10k trail events)
  is about 2–5 MB, which is fine. Past that, the next step is to move `trail` into its own append-only table.
  That is a contained change.
- *Option for v1 if you want it:* a normalized `trail_events` table (append-only, `REVOKE UPDATE, DELETE`) as a
  tamper-evident audit log alongside the JSONB copy. About 40 lines.

## Auth

- **Email and password, checked on the server.** Passwords are hashed with `node:crypto` scrypt, so no new
  dependency. Routes are `/api/auth/signup | login | logout | me`. Login and signup are rate-limited with the
  existing `rateLimiter`.
- **Session:** a random 32-byte token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie. Only its hash is
  stored. It expires after 30 days, and the 30 days restart with each use. Logout deletes the row.
- **CSRF:** `SameSite=Lax`, plus every `/api/*` route that changes data requires `Content-Type: application/json`
  and an `Origin` header that matches the host.
- **Scope:** owner routes take `business_id` from the session only, never from the request. That one rule keeps
  each business inside its own data. A test checks that owner A gets a 404 on B's data.
- **UI:** `origin/main` already has `Login.jsx`, `RequireSession` and sign-out in Settings (PRs #3–#5). This branch
  is behind it, so step 1 merges `origin/main`. Then `src/services/session.js` switches from the local PBKDF2
  device key to `fetch('/api/auth/...')`. The screens stay as they are.
- **Signup** creates the business, the owner and an **empty** ledger: the business profile only, with no demo
  customers or invoices. It is built by `buildEmpty(business)`, which has the same structure as `buildSeed()`.
- No password-reset email in v1, because that needs an email provider. Until then, a forgotten password has to be
  reset by hand in SQL. Listed as a follow-up.

## "Today" in production

Every action treats `state.settings.demoDate` as today. For a real business, the server sets it to the current date
in Asia/Kolkata on every read and before every action. The demo business keeps its fixed date. No action code changes.

## Customer `/pay/:token` page

Right now this page reads the owner's localStorage, so it only works in the owner's own browser. A real customer
opening the link sees "invalid link".

- `GET /api/pay/:token` needs no login. It looks the token up in `pay_tokens` and returns **only** what the page
  shows: business name, logo, UPI and bank details, customer name, invoice number, dates, total, received, balance,
  and the dispute and claim flags. It never returns the ledger.
- `POST /api/pay/:token/claim | dispute | message` runs `customerClaim`, `raiseDispute(..., 'customer')` and
  `customerMessage` through the same transaction path, locked to that one invoice. All of them are rate-limited.
- **Security fix included:** pay tokens can be guessed today (`p` plus the invoice id and number digits, in
  `actions.js:46` and `seed.js:183`). They become 128-bit random values that `saveInvoice` generates from
  `crypto.getRandomValues`, which works in both browser and Node 20+. The server writes the `pay_tokens` row in the
  same transaction that issues the invoice.
- `CustomerPay.jsx` fetches from that endpoint instead of `useStore()`. The markup stays.

## Moving existing browser data

The first time an owner signs in on a browser that still has saved Harbor data in localStorage, Harbor offers a
choice: **Import the data saved on this device** or **Ignore**. Import posts the document to `/api/state/import`,
which checks it with `validateState` and accepts it only while the server ledger is still empty. This is the only
place a whole state is accepted, and it is guarded. The local copy stays until the owner removes it.

## Demo mode (HackCache judges, video)

`npm run db:seed-demo` (or `SEED_DEMO=1` on Render) creates one demo business with `buildSeed()` data and the
fixed demo date, then prints its login. The live demo keeps working.

## Backups and Render

- `render.yaml` adds a `databases:` entry (`harbor-db`, Postgres 16) and gives the web service `DATABASE_URL`
  via `fromDatabase.connectionString`.
- **Decision needed:** Render's **free** Postgres has **no backups and is deleted after 30 days**. Real use needs
  `basic-256mb` or above (about $6/mo, with daily backups and point-in-time recovery). The blueprint uses
  `basic-256mb` unless you say otherwise.
- The existing "Download my data" export in Settings stays, so an owner can keep their own backup copy.
- Schema lives in `server/schema.sql`, all `CREATE TABLE IF NOT EXISTS`, applied when the server starts.
  shortcut: no migration tool; add one at the first change that alters an existing column.

## Files touched

| File | Change |
|---|---|
| `package.json` | add `pg` (the only new dependency); `db:seed-demo` script |
| `server/schema.sql` | new: the tables above |
| `server/db.js` | new: pool, `withLedger(businessId, fn)` transaction helper, today in IST |
| `server/auth.js` | new: scrypt, session cookie, `requireOwner` middleware |
| `server/index.js` | mount `/api/auth`, `/api/state`, `/api/actions/:name`, `/api/pay/:token` |
| `src/services/actions.js` | random pay token, nothing else |
| `src/data/seed.js` | random tokens on seed invoices; `buildEmpty(business)` |
| `src/store.jsx` | load from `/api/state`, async `run()`, refresh on focus; `storage.js` stays for import/export |
| `src/services/session.js`, `Login.jsx` | call the server instead of the device key |
| `src/pages/CustomerPay.jsx` | fetch the public view, post customer actions |
| pages that call `run(...)` | add `await` |
| `render.yaml` | database and `DATABASE_URL` |
| `.github/workflows/ci.yml` | Postgres service container so the server tests run in CI |
| `tests/server-db.test.js` | new: action round trip, cross-business 404, pay view leaks no ledger fields, auth, concurrent writes |

## Tests

- The existing 125 tests run unchanged. They cover the pure functions, which don't change except for the token
  format, and no test checks that format.
- The new server tests need a real Postgres. They run when `DATABASE_URL` is set and are skipped otherwise, so
  `npm test` stays green on a laptop without Docker. Locally that means
  `docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16`; in CI it is a service container.

## Open decisions

1. **One JSONB ledger per business** (recommended) or normalized tables per entity?
2. Add the append-only `trail_events` audit table in v1? (Recommendation: later.)
3. Render Postgres **`basic-256mb`** (backups, about $6/mo) or free (no backups, deleted after 30 days)?
4. The **GitHub Pages build** (`pages.yml`) has no server to talk to. Drop it, or keep it as a static demo that only
   uses the browser? Keeping it means two storage paths in `store.jsx`. Recommendation: drop it, since the demo
   business on Render replaces it.
5. OK to merge `origin/main` (the login screens, PRs #3–#5) into this branch first? This branch also has the
   unpushed MSMED commit `4a80f52`, which `origin/main` lacks.

## Not in v1

Password-reset email, several owners or staff per business, realtime sync, reporting tables, deploying.
Nothing is pushed to main or deployed without asking.
