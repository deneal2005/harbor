import { describe, expect, it } from 'vitest';
import { STEPS, invoicesEmptyState, stepProblems } from '../src/services/formFlow.js';

const line = (over = {}) => ({ description: 'Mono cartons', hsn: '4819', qty: '10', unit: 'pcs', rate: '1000', discountPct: '0', taxRate: '18', ...over });

describe('invoice form step flow', () => {
  it('exposes exactly three steps', () => {
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it('step 1 needs a customer and a valid date; place-of-supply problems surface here', () => {
    const empty = { customerId: '', date: '2026-10-23', creditDays: '30', lines: [line()] };
    expect(stepProblems(empty, 1, null)).toEqual(['customer']);
    expect(stepProblems({ ...empty, customerId: 'c2', date: 'x' }, 1, null)).toEqual(['date']);
    const badSupply = { customerId: 'c2', date: '2026-10-23', placeOfSupply: '', lines: [line()] };
    const calc = { ok: false, error: 'placeOfSupply' };
    expect(stepProblems({ ...badSupply }, 1, calc)).toEqual(['placeOfSupply']);
  });
  it('step 1 passes on a valid form (calc not consulted when fine)', () => {
    const ok = { customerId: 'c2', date: '2026-10-23', placeOfSupply: '27', lines: [line()] };
    expect(stepProblems(ok, 1, { ok: true })).toEqual([]);
    expect(stepProblems(ok, 2, null)).toEqual([]);
  });

  it('step 2 requires a description and a positive rate per line', () => {
    expect(stepProblems({ lines: [] }, 2, null)).toEqual(['noLines']);
    const problems = stepProblems({ lines: [line({ description: '', rate: '' })] }, 2, null);
    expect(problems).toEqual([
      { code: 'descRequired', line: 0 },
      { code: 'rateRequired', line: 0 },
    ]);
    // wrong line flags the right index
    const twoLines = stepProblems({ lines: [line(), line({ rate: 'n/a' })] }, 2, null);
    expect(twoLines).toEqual([{ code: 'rateRequired', line: 1 }]);
  });
  it('step 2 rejects text rates and zero rates but keeps the engine untouched', () => {
    expect(stepProblems({ lines: [line({ rate: 'abc' })] }, 2, null)).toEqual([{ code: 'rateRequired', line: 0 }]);
    expect(stepProblems({ lines: [line({ rate: '0' })] }, 2, null)).toEqual([{ code: 'rateRequired', line: 0 }]);
    // '1000.50' is a legal money amount and passes
    expect(stepProblems({ lines: [line({ rate: '1000.50' })] }, 2, null)).toEqual([]);
  });
  it('step 3 has no extra UI validation — the engine validates on submit', () => {
    expect(stepProblems({ lines: [line()] }, 3, null)).toEqual([]);
  });
});

describe('invoices empty-state copy', () => {
  it('nothing exists yet beats the filter explanation', () => {
    expect(invoicesEmptyState({ rowsLength: 0, totalLength: 0, hasFilters: true })).toBe('inv.emptyNone');
    expect(invoicesEmptyState({ rowsLength: 0, totalLength: 5, hasFilters: true })).toBe('inv.emptyFiltered');
    expect(invoicesEmptyState({ rowsLength: 0, totalLength: 5, hasFilters: false })).toBe('inv.emptyNone');
    expect(invoicesEmptyState({ rowsLength: 3, totalLength: 5, hasFilters: true })).toBeNull();
  });
});
