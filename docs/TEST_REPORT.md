# Harbor — test report, screen audit and status

Everything below was actually run on 23 Oct 2026 (real date) against the code in this repository. Nothing is marked *verified* without a test run or a recorded browser interaction.

## 1. Automated tests

`npm test` → **80 passed, 0 failed** (5 files). Full verbose output: [`test-output.txt`](test-output.txt).

| File | Covers |
|---|---|
| `tests/gst.test.js` | money formatting/parsing/rounding, GST tests A and B, 3×₹333 at 5%, discount, zero-rated, composition, multi-line round-off, invalid rates and state data, amount in words, GSTIN accept/reject, invoice numbering across financial years |
| `tests/engine.test.js` | invoice states, partial payments, disputes, timeline, ladder stages from schedule and Demo Date, no double send, audited reset, dispute/promise pause and resume, part payment in reminder amount, "prepared ≠ sent", customer metrics, forecast carry-forward and reconciliation, first breach, no paid/disputed/double counting, scenario isolation, payment moves expected → cash, what-ifs, buffer change, priority reproducibility, timing rules, exclusions, ranking updates, collection plan, collect-by date |
| `tests/reconciliation.test.js` | all six statement cases, re-import idempotency, same-file duplicates, nothing changes before confirmation, no double confirmation, malformed files, reference normalisation, similar customer names, claim needs evidence |
| `tests/audit.test.js` | integrity audit passes on seed and reports the real breach, payload contains no PII, field whitelist, blocking validation, negative balance and tampered totals, screen mismatch and duplicate imports; API: health, real task slug + minimised payload + idempotency key, duplicate submissions, invalid payload rejected before Render, start timeout and failed run reported (no fake result), 503 when not configured |
| `tests/i18n.test.js` | Hindi has every English key with identical placeholders; templates in both languages; demand letter title/disclaimer |

### GST expected vs actual

| Case | Expected | Actual |
|---|---|---|
| ₹10,000 @18% MH→MH | CGST 900, SGST 900, total 11,800 | 900 / 900 / 11,800 ✅ |
| ₹10,000 @18% MH→GJ | IGST 1,800, total 11,800 | 1,800 / 11,800 ✅ |
| 3 × ₹333 @5% | taxable 999.00, CGST 24.98, SGST 24.98, round-off 0.04, total 1,049 | ✅ |
| 10 × ₹1,000, 10% off | taxable 9,000 | ✅ |
| Composition | Bill of Supply, tax 0 | ✅ |
| Rate 12% (not configured) | rejected | ✅ |

### Reconciliation outcomes (sample `bank-statement.csv`)

| Row | Suggestion | After owner confirms |
|---|---|---|
| Kothrud ₹34,913 | Exact, high | 0068 paid; cash +₹34,913; gap ₹89,715 → ₹54,802 (browser-verified) |
| Wakad ₹30,000 | Partial, high | 0069 balance ₹24,005 |
| Deccan ₹56,385 | Multi (listed order) | 0066 and 0073 paid |
| Chakan ₹41,200 | Possible TDS (2% of ₹40,000) | 0070 balance ₹800 until TDS recorded |
| Surat ₹23,000 | Overpayment | 0067 paid; ₹687 unallocated credit (customer required) |
| R K Enterprises ₹12,000 | Unmatched | held for review |
| Same file again | — | 0 added, 6 skipped (browser-verified) |

### How the forecast carries forward
Week 1 opens with cash on hand. Each week's events (payments before receipts within a day) update a running balance; the week closes at that balance and the next week opens with it. Tested for all 13 weeks, and independently re-checked by the workflow's `check-invariants` task.

## 2. Browser verification (production build served by `node server/index.js`)

| Check | Result |
|---|---|
| All 18 routes incl. `/pay/:token`, `/print/*` and an unknown route load via direct URL (SPA fallback) | ✅ HTTP 200, app renders, no console errors |
| Dashboard shows first breach 1 Nov 2026, gap ₹89,715 (seed) | ✅ |
| Radar → "Try collect earlier" on 0060 → gap after ₹16,825 (= 89,715 − 72,890) | ✅ (after fixing the collect-by date, see §5) |
| Follow-ups → "I sent it" on Hadapsar's heads-up → stage stored, trail entry, due list 5 → 4 | ✅ |
| Customer page 0065 → dispute → Inbox shows it, follow-ups paused | ✅ |
| Payments → load sample twice → 6 suggestions, second import skipped 6 | ✅ |
| Confirm Kothrud → bank +₹34,913, gap → ₹54,802, 30-day expected drops by 34,913 + 88,980 (disputed) | ✅ |
| Demo Date +7 → stages advance (0055 → Demand Letter, 0060 → Final, Sahyadri promise lapsed → resumes) | ✅ |
| Reset (clear storage) → original scenario restored | ✅ |
| Corrupt/newer storage → recovery screen, nothing deleted | ✅ |
| Hindi + large text at 360 px: no horizontal overflow on 10 main routes | ✅ |
| Print invoice: totals, CGST/SGST, amount in words, UPI QR | ✅ (screen render; physical A4 print not tested) |
| Integrity check without Render credentials → 503, UI says no check was run | ✅ |

Not tested: real printer output, Safari/iOS, screen readers (semantic markup and labels were written for them but not tested with NVDA/VoiceOver), and a private-window test on a deployed URL.

## 3. Requirement checklist

| Area | Status |
|---|---|
| Signature slice: dashboard risk → explainable priority → follow-up → owner-confirmed payment → recalculated forecast | verified |
| Integer paise, IST dates, GST engine, round-off, words | verified |
| GSTIN checksum validator | verified |
| Invoice numbering per FY | verified |
| 13-week forecast, first breach, negative vs buffer, what-ifs, collection plan | verified |
| Priority engine with explanations | verified |
| Escalation ladder, pause/resume, once-only stages | verified |
| Customer page + Inbox (same browser) | verified |
| CSV reconciliation, 6 cases, idempotency, TDS flag | verified |
| Payment Demand Letter, invoice print, evidence pack | verified (screen) |
| English/Hindi full UI and templates | verified (keys/placeholders tested; text not professionally reviewed) |
| 360 px layout, large text, 48 px controls, focus outline | verified (layout); contrast not measured with a tool |
| localStorage persistence, versioning, recovery, Reset Demo | verified |
| Render Workflow code + server endpoint + UI status | verified locally with a test double (`tests/audit.test.js`) |
| Render deployment, workflow registered, real run | **blocked** (see §4) |
| Public GitHub repository | done: https://github.com/deneal2005/marlo |
| Demo video, pitch deck | not started (script and outline in `DEMO_SCRIPT.md`, `PITCH.md`) |
| User validation with real owners | not started (no results claimed) |
| Optional add-ons (email reminders, OCR) | intentionally deferred |

## 4. Deployment status

- **Render web service:** not deployed. `render.yaml` is ready.
- **Render Workflow:** not registered, and **no real run has happened**. `workflows/main.js` loads cleanly under Node (verified), but tasks only register on Render.
- **Blocker:** this environment has no Render account access. The Render MCP connector is not authorized and the Render CLI is not installed. Next steps: authorize the Render connector (or use the Dashboard), push the repo, then follow README → "Set up on Render".
- **Render bonus-track qualification is not complete** until a public URL is live and a real workflow run is recorded.

## 5. Defects found and fixed during verification

1. The "collect earlier" suggestion used the day before the *lowest* point (5 Nov), so the 1 Nov salary dip remained and the gap only fell to ₹34,715. It now uses the day before the *first* dip (31 Oct); a regression test was added.
2. The reminder-template editor was a component defined inside the page, so text areas would lose focus on each keystroke. It is now a render function.
3. Hindi templates used masculine first-person verb forms for the owner. They were changed to the neutral "we" (हम … करेंगे / चाहते हैं).

## 5b. Fixes from the code review

| # | Issue | Fix | Test |
|---|---|---|---|
| 1 | Lines above ~₹90 lakh rejected (integer overflow) | BigInt in `lineTaxable` | ₹1 crore line |
| 2 | Future-dated payment vanished from the forecast | `recordPayment` rejects dates after the Demo Date | `futureDate` |
| 3 | Public endpoint could start unlimited paid runs | 5 starts/min per IP, 429 after | rate-limit test |
| 4 | Past-dated scenario dropped money | scenario dates clamped to today | end cash unchanged |
| 5 | SPA fallback untested | test for `/pay/…` 200 and `/api/nope` 404 | added |
| 6 | Unused translation keys | 29 removed from both languages | i18n parity test |
| 7 | Empty migration table | removed | — |

## 5c. UI redesign check (browser)

- New shell: dark sidebar with icons and counts, sticky top bar (demo chip, demo date, New invoice), mobile bottom tab bar with a "More" sheet; currency and language switches in both.
- Dashboard: cash hero with a 13-week runway chart, "Today's plan" checklist, 4 KPI tiles, compact priority list with score bars, ageing bar, disputes, activity.
- Dialogs (native `<dialog>`) for payment promise, snooze, dispute, record payment, adjustment, stage reset and reset demo. Verified: promise saved and the item left today's list; a future-dated payment is refused inside the dialog.
- Currency: switching to USD showed ₹2,85,000 as $3,238.64 (rate 88) and the header states the rate; customer messages and documents stay in ₹.
- An automated sweep of all 19 routes × English/Hindi (large text) at 360 px found no horizontal overflow, no untranslated keys and no error screens. One overflow found during the sweep (dashboard priority card) was fixed with `min-w-0`.

## 6. Screen-by-screen audit

| Screen | Working functionality | Known gaps |
|---|---|---|
| Dashboard | breach alert, 8 metrics linking to filtered views, ageing (5 buckets, clickable), top 5, responses, disputes, unmatched credits, recent decisions | — |
| Cash Gap Radar | gap, causes, late receipts, collection plan, counterfactual (earlier/partial/delay/promise), ranked cards with "Why this invoice?", review list | — |
| Cash forecast | chart, 13-week table (cards on mobile), breach-week day ledger, integrity check, all six what-ifs, held invoices, assumptions | — |
| Today's follow-ups | due stages, reason, EN/HI message, WhatsApp/email/SMS handoff (logged as prepared), "I sent it", promise, snooze, dispute, paused and upcoming lists, history | — |
| Invoices | search, status/ageing filters, sort, table/cards | — |
| Invoice detail | status, balances, payments, record payment, TDS/credit note/write-off, resolve dispute, ladder with dates, stop/resume, audited stage reset, customer link, documents, timeline | — |
| New invoice | customer, addresses, dates, credit days, place of supply, lines with HSN/qty/unit/rate/discount/GST, live totals, words, e-invoice note, draft/issue | new customers cannot be created in the form (customers are seeded) |
| Customers | grade with explanation or "Not enough history", outstanding, delay, on-time %, next expected, contact, language, invoices, payment history | customer records cannot be edited |
| Inbox | payment claims (confirm with evidence / reject), disputes (to resolution), messages | — |
| Payments | CSV import (file or sample), 6 match types with reasons, allocation editor, excess → customer credit, hold/ignore/reopen, manual entry, import history | — |
| Documents | demand letters per overdue customer, invoice copies, evidence packs, bilingual headings toggle | — |
| Reminder ladder | offsets, enable/disable, EN/HI templates, extra templates, pause rules | — |
| Settings | Demo Date (+1/+7/reset), Reset demo, export, language, text size, cash settings, scheduled payments, business profile with GSTIN check, privacy notice | — |
| Customer page | balance, instructions, paid/dispute/message forms | same-browser only |
