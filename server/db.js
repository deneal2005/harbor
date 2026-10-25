// Postgres access. Each business's ledger is one JSONB document; every write runs the same pure
// transitions from src/services/actions.js inside a transaction that holds the ledger's row lock.
import { readFileSync } from 'node:fs';
import pg from 'pg';

export function createPool(connectionString) {
  return new pg.Pool({ connectionString, max: 5 });
}

export async function migrate(pool) {
  await pool.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
}

// The app's "today" is state.settings.demoDate. Real businesses live on the calendar date in India.
export const todayIST = (now = Date.now()) => new Date(now + 330 * 60000).toISOString().slice(0, 10);

const live = (state, demo) => (demo ? state : { ...state, settings: { ...state.settings, demoDate: todayIST() } });

export async function readLedger(pool, businessId) {
  const { rows } = await pool.query(
    'SELECT l.state, l.version, b.demo FROM ledgers l JOIN businesses b ON b.id = l.business_id WHERE l.business_id = $1', [businessId]);
  return rows[0] ? { state: live(rows[0].state, rows[0].demo), version: rows[0].version, demo: rows[0].demo } : null;
}

const tokensOf = (state) => state.invoices.filter((i) => i.token).map((i) => [i.token, i.id]);

// Register pay links that are new in `after`, in the caller's transaction.
export async function syncTokens(client, businessId, before, after) {
  const known = new Set(before ? tokensOf(before).map(([t]) => t) : []);
  for (const [token, invoiceId] of tokensOf(after)) {
    if (!known.has(token)) {
      await client.query('INSERT INTO pay_tokens (token, business_id, invoice_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [token, businessId, invoiceId]);
    }
  }
}

export async function inTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Lock the ledger, run fn(state) -> { state, error?, ...extra }, and save the new state unless
 * fn reported an error or changed nothing. With expectVersion, refuses ('stale') when the ledger has
 * moved on since the caller last saw it. Returns fn's result (with the saved version), or null
 * when the business has no ledger.
 */
export async function withLedger(pool, businessId, fn, { expectVersion } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT l.state, l.version, b.demo FROM ledgers l JOIN businesses b ON b.id = l.business_id WHERE l.business_id = $1 FOR UPDATE OF l', [businessId]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    // A browser that applied the action to an older copy would get different ids: make it reload.
    if (expectVersion !== undefined && expectVersion !== rows[0].version) {
      await client.query('ROLLBACK');
      return { state: live(rows[0].state, rows[0].demo), version: rows[0].version, error: 'stale' };
    }
    const before = live(rows[0].state, rows[0].demo);
    const out = await fn(before, { demo: rows[0].demo });
    if (out.error || !out.state || out.state === before) {
      await client.query('ROLLBACK');
      return { ...out, state: before, version: rows[0].version };
    }
    const { rows: [saved] } = await client.query(
      'UPDATE ledgers SET state = $2, version = version + 1, updated_at = now() WHERE business_id = $1 RETURNING version', [businessId, out.state]);
    await syncTokens(client, businessId, before, out.state);
    await client.query('COMMIT');
    return { ...out, version: saved.version };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
