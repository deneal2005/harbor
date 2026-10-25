-- Applied on every server start; every statement must be safe to re-run.
-- shortcut: no migration tool; add one at the first change that alters an existing column.
CREATE TABLE IF NOT EXISTS businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demo        boolean NOT NULL DEFAULT false,   -- keeps its fixed demo date and may be reset to sample data
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,           -- stored lower-cased
  password_hash text NOT NULL,                  -- scrypt$N$salt$hash
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  bytea PRIMARY KEY,                -- sha256 of the cookie value; the raw token is never stored
  owner_id    uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions (owner_id);

-- The whole ledger of one business, in the shape validateState() checks: business profile, customers,
-- invoices (with their reminder ladder), payments, adjustments, credits, expenses, bank txns, inbox, trail.
CREATE TABLE IF NOT EXISTS ledgers (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  state       jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Customer pay links: find the business behind a link without scanning every ledger.
CREATE TABLE IF NOT EXISTS pay_tokens (
  token       text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id  text NOT NULL
);
