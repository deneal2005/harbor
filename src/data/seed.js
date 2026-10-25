// Deterministic synthetic demo dataset. Every business, person, GSTIN, phone number, address and
// bank detail here is FICTIONAL. Invoices are built through the real GST engine so stored totals,
// balances and payments always agree. Reset Demo rebuilds exactly this state.
import { addDays } from '../utils/dates.js';
import { calculateInvoice } from '../services/gst.js';
import { formatNumber } from '../services/invoices.js';
import { DEFAULT_FX, LADDER, SCHEMA_VERSION } from './config.js';
import { TEMPLATES } from './templates.js';

export const DEMO_DATE = '2026-10-23';

export const BUSINESS = {
  name: 'Sharma Packaging',
  sample: true,
  address: 'Unit 14, Bhosari MIDC, Pune 411026',
  state: 'Maharashtra',
  stateCode: '27',
  gstin: '27AAKFS7319M1ZJ',
  registrationType: 'regular',
  aggregateTurnoverPaise: 2_40_00_000_00, // ₹2.4 crore (below the e-invoicing threshold)
  udyam: { registered: true, category: 'micro', number: 'UDYAM-MH-26-0000000 (sample)' },
  owner: 'Deneal Thangjam',
  email: 'deneal@sharma-packaging.example',
  phone: '+91 90000 00000',
  bank: { name: 'Sample Bank (fictional)', account: '000000000000 (sample)', ifsc: 'SMPL0000000' },
  logo: null, // data URL (PNG/JPG, max 200 KB) set in Settings; older saved data simply has no logo
  upiId: 'sharmapackaging@sample',
  paymentTermsDays: 30,
  invoicePrefix: 'INV',
  employees: 8,
  balanceDate: '2026-10-18',
  openingBalancePaise: 3_53_000_00,
  bufferPaise: 1_50_000_00,
  // Assumption for invoices not yet raised: receipts from future sales, starting after a normal
  // 30-day credit cycle plus delay. Labelled "assumed" everywhere; set to 0 to forecast only known invoices.
  assumedWeeklySalesPaise: 1_45_000_00,
  assumedSalesStartDays: 42,
};

const C = (id, name, contactName, stateCode, gstin, creditDays, language, city) => ({
  id, name, contactName, stateCode, gstin, registered: !!gstin, creditDays, language,
  phone: `+91 90000 ${String(10000 + Number(id.slice(1))).slice(1)}`,
  email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-+$/, '')}.example`,
  address: `${city} (sample address)`,
});

// delays: days late (negative = early) for this customer's settled invoices, oldest first.
const CUSTOMERS = [
  C('c1', 'Deccan Snacks Pvt Ltd', 'Priya Kulkarni', '27', '27AACCD4821K1ZN', 30, 'en', 'Hadapsar, Pune'),
  C('c2', 'Kothrud Pharma Distributors', 'Anil Joshi', '27', '27AAFFK2290P1ZU', 30, 'en', 'Kothrud, Pune'),
  C('c3', 'Sahyadri Dairy Foods', 'Meena Patil', '27', '27ABAFS6612R1ZN', 30, 'hi', 'Satara'),
  C('c4', 'Nashik Agro Exports', 'Suresh Deshmukh', '27', '27AAHCN5098E1Z6', 30, 'hi', 'Nashik'),
  C('c5', 'Pimpri Auto Components', 'Vikram Rao', '27', '27AADCP7743L1ZX', 30, 'en', 'Pimpri, Pune'),
  C('c6', 'Konkan Spices and Masala', 'Farah Shaikh', '27', '27ABDFK3381H1Z9', 30, 'hi', 'Ratnagiri'),
  C('c7', 'Baramati Sweets', 'Rohit Jadhav', '27', '27AAPFB9054Q1ZJ', 30, 'en', 'Baramati'),
  C('c8', 'Surat Textile Traders', 'Hetal Mehta', '24', '24AAJFS2716D1ZI', 30, 'en', 'Ring Road, Surat'),
  C('c9', 'Hadapsar Electronics Assembly', 'Nikhil Pawar', '27', '27AAGCH8835N1ZV', 30, 'en', 'Hadapsar, Pune'),
  C('c10', 'Chakan Home Appliances', 'Kavita Iyer', '27', '27AACCC1460T1Z9', 30, 'en', 'Chakan, Pune'),
  C('c11', 'Shree Ganesh Kirana Wholesale', 'Ganesh Wagh', '27', null, 15, 'hi', 'Market Yard, Pune'),
  C('c12', 'Wakad Bakery Supplies', 'Sneha Gokhale', '27', '27ABCFW5527J1ZT', 30, 'hi', 'Wakad, Pune'),
];

// Payment-history delay samples, separate from the seeded customer records so the
// saved state never carries throwaway demo metadata on customers themselves.
const DELAYS = {
  c1: [0, -2, 1, 0, 2, 0],
  c2: [0, 1, -1, 0, 1],
  c3: [3, 5, 2, 6, 4],
  c4: [28, 32, 26, 34],
  c5: [25, 30, 27, 31],
  c6: [10, 14, 12, 11],
  c7: [4, 6, 3, 5],
  c8: [8, 7, 9, 10, 8],
  c9: [15, 14, 16, 18],
  c10: [0, 1, 0, -1, 2, 0],
  c11: [5, 6],
  c12: [1, 2, 0, 3],
};

// Product lines. Rates are configurable per line; the sample uses 5% for corrugated cartons and 18%
// for printing services as illustrative values — confirm the applicable rate before real use.
const CARTON = (qty, rupees, discountPct = 0) => ({ description: 'Corrugated cartons, 5-ply', hsn: '4819', qty, unit: 'pcs', ratePaise: rupees * 100, discountPct, taxRate: 5 });
const BOX = (qty, rupees, discountPct = 0) => ({ description: 'Printed mono cartons', hsn: '4819', qty, unit: 'pcs', ratePaise: rupees * 100, discountPct, taxRate: 5 });
const PRINT = (rupees) => ({ description: 'Printing & die-cutting charges', hsn: '998912', qty: 1, unit: 'job', ratePaise: rupees * 100, discountPct: 0, taxRate: 18 });

// [customer, invoice date, lines, extra]
// extra: paidDelay (settled in full that many days after due), partial [{amountPaise,date}],
//        dispute, promise, draft, reminders
const LEDGER = [
  // Settled July - September
  ['c1', '2026-07-03', [CARTON(1200, 28), PRINT(4000)], { paid: true }],
  ['c10', '2026-07-06', [CARTON(2000, 31)], { paid: true }],
  ['c4', '2026-07-08', [CARTON(900, 30)], { paid: true }],
  ['c2', '2026-07-10', [BOX(3000, 9)], { paid: true }],
  ['c8', '2026-07-14', [CARTON(1000, 27)], { paid: true }],
  ['c12', '2026-07-17', [BOX(2500, 8)], { paid: true }],
  ['c3', '2026-07-21', [CARTON(800, 26)], { paid: true }],
  ['c1', '2026-07-28', [BOX(4000, 7.5)], { paid: true }],
  ['c5', '2026-07-30', [CARTON(1500, 29)], { paid: true }],
  ['c10', '2026-08-04', [CARTON(1800, 31), PRINT(6000)], { paid: true }],
  ['c6', '2026-08-07', [BOX(2000, 10)], { paid: true }],
  ['c9', '2026-08-11', [CARTON(700, 33)], { paid: true }],
  ['c2', '2026-08-14', [BOX(2800, 9)], { paid: true }],
  ['c7', '2026-08-18', [BOX(1500, 11)], { paid: true }],
  ['c3', '2026-08-22', [CARTON(900, 26)], { paid: true }],
  ['c1', '2026-08-26', [CARTON(1100, 28)], { paid: true }],
  ['c8', '2026-08-29', [CARTON(1200, 27)], { paid: true }],
  ['c12', '2026-09-02', [BOX(2200, 8)], { paid: true }],
  ['c10', '2026-09-05', [CARTON(1600, 31)], { paid: true }],
  ['c2', '2026-09-09', [BOX(2600, 9)], { paid: true }],
  // Open, overdue and old
  ['c4', '2026-06-10', [CARTON(700, 29)], { creditDays: 30 }], // >90 days overdue
  ['c5', '2026-07-21', [CARTON(2400, 29), PRINT(8000)], { reminders: { 'heads-up': '2026-08-17', due: '2026-08-20', firm: '2026-08-27', final: '2026-09-04', demand: '2026-09-19' } }],
  ['c9', '2026-08-14', [CARTON(800, 33), PRINT(2000)], { reminders: { due: '2026-09-13', firm: '2026-09-20', final: '2026-09-28' } }],
  ['c5', '2026-08-26', [CARTON(1400, 30)], { reminders: { due: '2026-09-25', firm: '2026-10-02', final: '2026-10-10' } }],
  ['c6', '2026-09-01', [BOX(5000, 11)], { partial: [{ amountPaise: 25_000_00, date: '2026-10-10' }], reminders: { due: '2026-10-01', firm: '2026-10-08', final: '2026-10-16' } }],
  ['c4', '2026-09-08', [CARTON(2200, 29), PRINT(5000)], { reminders: { 'heads-up': '2026-10-05', due: '2026-10-08', firm: '2026-10-15' } }],
  ['c7', '2026-09-10', [BOX(2500, 11)], { dispute: { reason: 'Print colour on 500 boxes does not match the approved sample.', raisedOn: '2026-10-12', by: 'customer' } }],
  ['c3', '2026-09-15', [CARTON(800, 28)], { promise: { date: '2026-10-28', note: 'Accounts will release payment with the month-end run.', recordedOn: '2026-10-19' }, reminders: { due: '2026-10-15' } }],
  ['c9', '2026-09-25', [CARTON(2600, 34), PRINT(12000)], {}],
  ['c11', '2026-10-15', [BOX(1500, 9)], { creditDays: 15 }],
  ['c8', '2026-10-03', [CARTON(2600, 30), PRINT(6000)], {}],
  // Open, not yet due (some are paid by the sample bank statement)
  ['c1', '2026-10-09', [CARTON(1300, 29)], {}],
  ['c8', '2026-10-10', [BOX(2500, 8.5)], {}],
  ['c2', '2026-10-11', [BOX(3500, 9.5)], {}],
  ['c12', '2026-10-13', [BOX(5000, 9.5), PRINT(3500)], {}],
  ['c10', '2026-10-13', [CARTON(1250, 32)], {}],
  ['c10', '2026-10-15', [CARTON(6500, 33, 5), PRINT(15000)], {}],
  ['c1', '2026-10-16', [BOX(2000, 8)], {}],
  ['c4', '2026-10-21', [CARTON(1100, 30)], {}],
  ['c12', '2026-10-22', [BOX(1800, 9)], { draft: true }],
];

// Earlier settled invoices (April - June) giving each customer at least six months of history.
function buildHistory(customers) {
  const out = [];
  let seq = 0;
  const starts = ['2026-04-06', '2026-05-04', '2026-06-01'];
  for (const c of customers) {
    const n = c.id === 'c11' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      seq += 1;
      const date = addDays(starts[i], Number(c.id.slice(1)));
      const dueDate = addDays(date, c.creditDays);
      out.push({ customerId: c.id, number: formatNumber('INV', '26-27', seq), date, dueDate, paidDate: addDays(dueDate, DELAYS[c.id][i]), amountPaise: (30 + Number(c.id.slice(1)) * 3) * 1000_00 });
    }
  }
  return { history: out, nextSeq: seq + 1 };
}

const EXPENSES = [
  { id: 'payroll', label: 'Salaries (8 staff)', category: 'payroll', amountPaise: 2_64_000_00, schedule: { type: 'monthly', day: 1 } },
  { id: 'rent', label: 'Factory rent', category: 'rent', amountPaise: 55_000_00, schedule: { type: 'monthly', day: 5 } },
  { id: 'power', label: 'Electricity (MSEDCL bill, sample)', category: 'operating', amountPaise: 22_000_00, schedule: { type: 'monthly', day: 10 } },
  { id: 'ink', label: 'Inks & adhesives supplier', category: 'supplier', amountPaise: 32_000_00, schedule: { type: 'monthly', day: 12 } },
  { id: 'transport', label: 'Transport & fuel', category: 'operating', amountPaise: 18_000_00, schedule: { type: 'monthly', day: 15 } },
  { id: 'gst', label: 'GST payment (monthly filer, estimate)', category: 'tax', amountPaise: 68_000_00, schedule: { type: 'monthly', day: 20 } },
  { id: 'kraft', label: 'Kraft paper & board — paper mill', category: 'supplier', amountPaise: 1_40_000_00, schedule: { type: 'monthly', day: 27 } },
];

export function buildSeed() {
  const { history, nextSeq } = buildHistory(CUSTOMERS);
  const customers = CUSTOMERS.map((c) => ({ ...c }));
  const delayIdx = Object.fromEntries(CUSTOMERS.map((c) => [c.id, 3]));
  const invoices = [];
  const payments = [];
  let seq = nextSeq;
  let pay = 1;
  const issued = LEDGER.filter((r) => !r[3].draft).sort((a, b) => a[1].localeCompare(b[1]));
  const drafts = LEDGER.filter((r) => r[3].draft);
  for (const [i, [cid, date, lines, extra]] of [...issued, ...drafts].entries()) {
    const c = CUSTOMERS.find((x) => x.id === cid);
    const creditDays = extra.creditDays ?? c.creditDays;
    const calc = calculateInvoice({ lines, business: BUSINESS, placeOfSupply: c.stateCode });
    if (!calc.ok) throw new Error(`seed invoice ${i} invalid: ${calc.error}`);
    const id = `inv-${String(i + 1).padStart(3, '0')}`;
    const number = extra.draft ? null : formatNumber('INV', '26-27', seq++);
    const dueDate = addDays(date, creditDays);
    invoices.push({
      id, number, customerId: cid, date, dueDate, creditDays, placeOfSupply: c.stateCode, billingAddress: c.address, deliveryAddress: '',
      reverseCharge: false, lines, docType: calc.docType, taxablePaise: calc.taxablePaise, totalPaise: calc.totalPaise,
      status: extra.draft ? 'draft' : 'issued', token: number ? `p${number.replace(/\D/g, '').slice(-4)}${id.slice(-3)}` : null,
      reminders: Object.fromEntries(Object.entries(extra.reminders || {}).map(([k, d]) => [k, { date: d, channel: 'whatsapp' }])),
      dispute: extra.dispute || null, promise: extra.promise || null, claim: null, snoozedUntil: null, stopped: false,
    });
    if (extra.paid) {
      const dd = DELAYS[cid];
      const delay = dd[delayIdx[cid]++ % dd.length];
      payments.push({ id: `pay-${pay++}`, invoiceId: id, amountPaise: calc.totalPaise, date: addDays(dueDate, delay), method: 'bank', note: 'Sample settled payment', source: 'seed', bankTxnId: null, confirmedOn: addDays(dueDate, delay) });
    }
    for (const p of extra.partial || []) {
      payments.push({ id: `pay-${pay++}`, invoiceId: id, amountPaise: p.amountPaise, date: p.date, method: 'bank', note: 'Part payment', source: 'seed', bankTxnId: null, confirmedOn: p.date });
    }
  }

  const trail = [];
  const inbox = [];
  const disputed = invoices.find((i) => i.dispute);
  inbox.push({ id: 'in-1', type: 'dispute', invoiceId: disputed.id, date: disputed.dispute.raisedOn, status: 'pending', actor: 'customer', data: { reason: disputed.dispute.reason } });
  trail.push({ id: 'ev-1', date: disputed.dispute.raisedOn, ts: '2026-10-12T10:15:00.000Z', type: 'dispute-raised', invoiceId: disputed.id, amountPaise: null, actor: 'customer', detail: { reason: disputed.dispute.reason } });
  const promised = invoices.find((i) => i.promise);
  trail.push({ id: 'ev-2', date: promised.promise.recordedOn, ts: '2026-10-19T06:40:00.000Z', type: 'promise', invoiceId: promised.id, amountPaise: promised.totalPaise, actor: 'owner', detail: { promiseDate: promised.promise.date, note: promised.promise.note } });

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { demoDate: DEMO_DATE, language: 'en', textSize: 'normal', bilingualDocs: false, currency: 'INR', fxRates: { ...DEFAULT_FX }, ladder: LADDER.map((s) => ({ ...s, enabled: true })), templates: structuredClone(TEMPLATES) },
    business: structuredClone(BUSINESS),
    customers, invoices, payments, adjustments: [], credits: [], expenses: structuredClone(EXPENSES), history,
    bankTxns: [], imports: [], inbox, trail, counters: { id: 1000 },
  };
}

// A new business's empty ledger: same shape as the demo, none of its records. The owner fills in the
// profile (GST state, bank, UPI) in Settings before issuing the first invoice.
export function buildEmpty({ email = '', today }) {
  const seed = buildSeed();
  return {
    ...seed,
    settings: { ...seed.settings, demoDate: today },
    business: {
      ...BUSINESS, name: 'My business', sample: false, address: '', state: '', stateCode: '', gstin: '', aggregateTurnoverPaise: 0,
      udyam: { registered: false, category: '', number: '' }, owner: '', email, phone: '', bank: { name: '', account: '', ifsc: '' },
      upiId: '', employees: 0, balanceDate: today, openingBalancePaise: 0, bufferPaise: 0, assumedWeeklySalesPaise: 0,
    },
    customers: [], invoices: [], payments: [], expenses: [], history: [], inbox: [], trail: [],
  };
}
