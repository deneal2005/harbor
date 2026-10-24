// GSTIN structure: 2-digit state code, 10-char PAN, entity number, 'Z', check character.
// The check character uses the published base-36 algorithm: for the first 14 characters,
// multiply each character's value (0-9, A-Z = 0..35) by alternating factors 1 and 2,
// add quotient and remainder of (product / 36), then check = (36 - total % 36) % 36.
// A passing GSTIN is only well-formed; this does NOT prove the business is registered.

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstinCheckChar(first14) {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (total % 36)) % 36];
}

export function validateGstin(raw) {
  const g = String(raw ?? '').trim().toUpperCase();
  if (g.length !== 15) return { ok: false, reason: 'length' };
  if (!FORMAT.test(g)) return { ok: false, reason: 'format' };
  const code = Number(g.slice(0, 2));
  if (code < 1 || code > 38 && code !== 97 && code !== 99) return { ok: false, reason: 'state' };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { ok: false, reason: 'checksum' };
  return { ok: true, value: g, stateCode: g.slice(0, 2) };
}

export const withCheckChar = (first14) => first14 + gstinCheckChar(first14);
