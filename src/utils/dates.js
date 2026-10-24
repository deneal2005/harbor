// Calendar dates are 'YYYY-MM-DD' strings in IST. Arithmetic goes through UTC day numbers,
// so no browser timezone can shift a date by one day.

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY = 86400000;

export function isValidDate(s) {
  const m = RE.exec(String(s ?? ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toDayNumber(s) {
  if (!isValidDate(s)) throw new RangeError(`Invalid date: ${s}`);
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

function fromDayNumber(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

export const addDays = (s, n) => fromDayNumber(toDayNumber(s) + n);

// Whole calendar days from a to b (b - a). Same date = 0.
export const daysBetween = (a, b) => toDayNumber(b) - toDayNumber(a);

export const compareDates = (a, b) => daysBetween(b, a);
export const minDate = (a, b) => (compareDates(a, b) <= 0 ? a : b);
export const maxDate = (a, b) => (compareDates(a, b) >= 0 ? a : b);

// Today's date in IST, used only to suggest a default; the app runs on the configurable Demo Date.
export function todayIST(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

// Indian financial year (1 April - 31 March) as '26-27'.
export function financialYear(s) {
  const [y, m] = s.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// Day of month, clamped (salary on the 31st falls on the 30th in a 30-day month).
export function dateInMonth(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

const MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'] };

export function formatDate(s, lang = 'en') {
  if (!isValidDate(s)) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${(MONTHS[lang] || MONTHS.en)[m - 1]} ${y}`;
}

export function formatDateShort(s, lang = 'en') {
  if (!isValidDate(s)) return '—';
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${(MONTHS[lang] || MONTHS.en)[m - 1]}`;
}
