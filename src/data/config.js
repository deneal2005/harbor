// Every business rule tunable lives here, not in components.

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'marlo:v1';

export const GST = {
  // The brief's main defaults are 0/5/18 with 3 and 40 also configurable. These are NOT a
  // classification of any product: the owner picks the rate that applies to each line.
  allowedRates: [0, 3, 5, 18, 40],
  defaultRate: 18,
  // e-invoicing: CBIC Notification 10/2023-CT makes it mandatory from 1 Aug 2023 for aggregate
  // turnover above ₹5 crore in any FY from 2017-18. Shown as a note only; Harbor issues no IRN.
  eInvoiceThresholdPaise: 5_00_00_000_00,
};


export const INVOICE = {
  prefix: 'INV',
  maxLength: 16, // Rule 46(b): up to 16 characters, unique per financial year
  dueSoonDays: 7,
};

// GST state codes (Notification 1/2017-CT). Print docs derive the state name from the code
// so changing the code in Settings can never leave a stale state name behind.
export const STATE_NAMES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};
// [code, name] pairs for place-of-supply pickers.
// Sorted: integer-like keys ("10") would otherwise come before "01".
export const STATES = Object.entries(STATE_NAMES).sort(([a], [b]) => a.localeCompare(b));

export const LADDER = [
  { id: 'heads-up', offset: -3, template: 'headsUp' },
  { id: 'due', offset: 0, template: 'due' },
  { id: 'firm', offset: 7, template: 'firm' },
  { id: 'final', offset: 15, template: 'final' },
  { id: 'demand', offset: 30, template: 'demand' },
  { id: 'review', offset: 45, template: 'review' },
];

export const FORECAST = {
  weeks: 13,
  // Customer delay is only used once there are at least this many settled invoices.
  minHistory: 3,
  // Fallback delay for customers without enough history (low confidence).
  defaultDelayDays: 10,
  // An unpaid invoice whose estimated date has already passed is assumed to arrive this many days
  // after the demo date (low confidence) instead of being placed in the past.
  overdueAssumptionDays: 7,
  // A payment within this many days of the due date counts as "on time".
  onTimeGraceDays: 2,
};

// Cash Gap-to-Action weights (sum = 100). The score orders work; it is not a probability of payment.
export const PRIORITY = {
  weights: { gap: 35, overdue: 20, history: 20, balance: 15, stage: 10 },
  overdueCapDays: 60, // overdue points grow linearly to this many days
  delayCapDays: 30, // history: average delay grows linearly to this many days
  balanceCapPaise: 1_00_000_00, // balance points saturate at ₹1,00,000
  // When an invoice already earns gap points, only half the balance weight applies so the
  // same rupees are not rewarded twice.
  balanceOverlapFactor: 0.5,
  insufficientHistoryPoints: 10,
  upcomingStageDays: 3,
};

export const RECONCILIATION = {
  // Possible TDS: shortfall equal to one of these percentages of the taxable value.
  tdsRates: [1, 2, 10],
  tdsTolerancePaise: 100, // ±₹1 for rounding by the payer
  // A bank credit within this many days of an already-recorded payment of the same amount is
  // offered as "already recorded" (link only, no new money) instead of a fresh match.
  recordedWindowDays: 7,
};

export const LETTER = { deadlineDays: 7 };

// Display-only example rates (rupees per 1 unit), not live. The owner edits them in Settings.
export const DEFAULT_FX = { USD: 88, EUR: 102, JPY: 0.58 };
