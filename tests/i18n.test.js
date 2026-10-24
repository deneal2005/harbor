import { describe, expect, it } from 'vitest';
import en, { simple as simpleEn } from '../src/i18n/en.js';
import hi, { simple as simpleHi } from '../src/i18n/hi.js';
import { TEMPLATES } from '../src/data/templates.js';
import { makeT } from '../src/i18n/translate.js';

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('localisation', () => {
  it('Hindi covers every English key with the same placeholders', () => {
    expect(Object.keys(hi).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in hi))).toEqual([]);
    for (const k of Object.keys(en)) expect(vars(hi[k]), k).toEqual(vars(en[k]));
  });
  it('every reminder template exists in both languages with the same placeholders', () => {
    for (const [k, tpl] of Object.entries(TEMPLATES)) expect(vars(tpl.hi), k).toEqual(vars(tpl.en));
  });
  it('the demand letter is never called a legal notice', () => {
    expect(en['letter.title']).toBe('Payment Demand Letter');
    expect(en['letter.disclaimer']).toContain('not a legal notice from a lawyer');
  });
});

describe('simple-language mode', () => {
  it('the simple overlay exists in both languages with the same keys, all present in the base dicts', () => {
    expect(Object.keys(simpleHi).sort()).toEqual(Object.keys(simpleEn).sort());
    for (const key of Object.keys(simpleEn)) {
      expect(en[key], `simple key ${key} missing in en`).toBeTruthy();
      expect(hi[key], `simple key ${key} missing in hi`).toBeTruthy();
      expect(typeof simpleEn[key]).toBe('string');
      expect(simpleEn[key].length).toBeGreaterThan(0);
      expect(simpleHi[key].length).toBeGreaterThan(0);
      // overlays never diverge between languages on {placeholders}
      expect(vars(simpleHi[key]), key).toEqual(vars(simpleEn[key]));
    }
  });
  it('look-up order: simple overlay wins, then language dict, then en', () => {
    const plain = makeT('en');
    const simple = makeT('en', true);
    expect(plain('fu.none')).toBe(en['fu.none']);
    expect(simple('fu.none')).toBe(simpleEn['fu.none']);
    // a key with no simple variant falls back to the base dict
    expect(simple('ev.invoice-issued')).toBe(en['ev.invoice-issued']);
  });
  it('simple mode keeps working in Hindi and stays independent per language', () => {
    const hiPlain = makeT('hi');
    const hiSimple = makeT('hi', true);
    expect(hiPlain('fu.none')).toBe(hi['fu.none']);
    expect(hiSimple('fu.none')).toBe(simpleHi['fu.none']);
  });
  it('interpolation still works on simple strings', () => {
    const t = makeT('en', true);
    expect(t('dash.alertBreach', { buffer: '₹1,00,000', date: '1 Nov' })).toContain('₹1,00,000');
    expect(t('dash.alertBreachGap', { gap: '₹89,715' })).toContain('₹89,715');
  });
});
