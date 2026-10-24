// Regression guard for the Batch 4 seed cleanup: the per-customer `delays`
// demo metadata moved out of the customer records into a module-local map, so
// the seed (and therefore any saved state derived from it) no longer carries
// throwaway fields. History dates must be byte-identical to the previous
// behaviour — only the metadata's storage location changed.
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';

describe('seed hygiene', () => {
  it('customer records carry no payment-history metadata', () => {
    const { customers } = buildSeed();
    for (const c of customers) {
      expect(Object.hasOwn(c, 'delays')).toBe(false);
    }
  });

  it('history dates are unchanged by the delays relocation', () => {
    const { history } = buildSeed();
    // Each customer has 3 settled history records (2 for c11), consuming the
    // first delays of the map: c1 → [0, -2, 1], c4 → [28, 32, 26].
    const c1 = history.filter((i) => i.customerId === 'c1').sort((a, b) => a.date.localeCompare(b.date));
    expect(c1.map((i) => i.paidDate)).toEqual([
      c1[0].dueDate, addDaysStr(c1[1].dueDate, -2), addDaysStr(c1[2].dueDate, 1),
    ]);
    // c4 ('Nashik Agro'): very late payer.
    const c4 = history.filter((i) => i.customerId === 'c4').sort((a, b) => a.date.localeCompare(b.date));
    expect(c4.map((i) => i.paidDate)).toEqual([
      addDaysStr(c4[0].dueDate, 28), addDaysStr(c4[1].dueDate, 32), addDaysStr(c4[2].dueDate, 26),
    ]);
  });

  it('every settled history record still has a paidDate', () => {
    const { history } = buildSeed();
    expect(history.length).toBeGreaterThan(0);
    for (const i of history) expect(i.paidDate).toBeTruthy();
  });
});

// Same shape as src/utils/dates.js addDays, local so the test stays independent.
function addDaysStr(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
