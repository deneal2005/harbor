# Harbor: requirement audit and upgrade notes (23 Oct 2026)

Harbor is the renamed Marlo codebase. Internal identifiers are kept on purpose so saved data and the Render setup keep working: localStorage key `marlo:v1`, npm package name, Render service name, `WORKFLOW_SLUG`, and the `/api/health` `service` field.

## Compliance audit

"Before" is the state found by reading the code and running it, not the old README. "After" was checked by an automated test (T) or a browser interaction (B).

| Requirement | Before | After |
|---|---|---|
| Invoices, customers, statuses, due dates, balances | Implemented | Unchanged; verified (T, B) |
| GST invoice: CGST/SGST vs IGST by state, per-line rounding, round-off | Implemented | Unchanged; verified (T). Slabs 0/3/5/18/40 match the post-Sept-2025 GST rate structure; product rates in the sample are illustrative |
| Progressive reminders and escalation ladder | Implemented | Unchanged; verified (T) |
| Payment Demand Letter clearly not a legal or GST notice | Implemented | Verified in browser: disclaimer present, no interest claim (B) |
| Partial payments update balances | Implemented | Verified (T, B) |
| **Duplicate payments / incorrect reconciliation** | **Broken**: a bank credit for money already recorded by hand or from a confirmed customer claim was suggested as an overpayment or applied to another open invoice, counting the cash twice | **Fixed**: new "Already recorded" match links the bank row to the existing payment and adds no money (`suggestMatch`, `linkTransaction`); regression test added (T) |
| Unmatched transactions, TDS, multi-invoice | Implemented | Unchanged; sample statement gives the same six suggestions (T, B) |
| Disputes and promises pause reminders | Implemented, but the owner could only record them from a due reminder card | **Fixed**: invoice page now has "Record payment promise" and "Pause for dispute" on any open invoice (B) |
| Cash-flow forecast with expenses | Implemented | Unchanged; verified (T) |
| Explainable prioritisation | Implemented | Now surfaced on the dashboard as one action (B) |
| Dashboard communicates position and next action | Partial: the plan listed a step but not why, or its effect | **Improved**: "Do this first" card with the reason, the scenario impact on the shortfall and direct actions (B) |
| See the effect of an action on the outlook | Partial: only visible by revisiting Radar/Forecast | **Added**: "Cash outlook updated" notice after any change that moves the projected shortfall (B) |
| Evidence and communication history | Implemented (Decision Trail, evidence pack) | Unchanged; new trail event `bank-linked` |
| Responsive, accessible | Implemented | Dashboard checked at 375 px: no horizontal scroll (B) |
| Branding | Marlo, with a favicon colour that did not match the app | Harbor everywhere a user sees it: title, sidebar, mobile header, favicon, theme colour, documents, Hindi text |

## Verification run

- `npm test`: 79 passed (78 existing + 1 new).
- `npm run lint`: 0 errors; the remaining warnings were already present (Print.jsx, fast-refresh exports, one set-state-in-effect in Layout).
- `npm run build`: succeeds; the bundle-size warning was already present.
- Browser (Vite dev server): dashboard → "Do this first" (Nashik Agro, INV/26-27/0060, scenario: shortfall ₹89,715 → ₹16,825) → invoice → record promise for 28 Oct (notice: ₹89,715 → ₹16,825) → record ₹72,890 payment (balance ₹0; bank balance ₹2,85,000 → ₹3,57,890) → Payments sample import (6 suggestions, unchanged) → demand letter text. No new console errors after a clean reload.

## Not verified / remaining limits

Still true from the original report: localStorage only, customer page works in the same browser only, no automatic messaging, no real Render Workflow run, Hindi not professionally reviewed, GST product rates not checked against the CBIC schedule. Not re-tested this round: Safari/iOS, screen readers, physical printing, the Render-hosted build, and the "Already recorded" card in the browser (covered by the unit test only).

## Round 2: forecast, customers, search (23 Oct 2026)

- **Cash forecast:** summary strip (cash today, lowest point, projected shortfall, cash in 13 weeks); chart with a rupee axis, dates, a shaded below-buffer zone, hover/focus tooltips and selectable weeks (keyboard accessible); a week-detail panel listing every receipt and payment with the running balance (defaults to the first shortfall week). The 13-column table is kept but folded into "Week-by-week table". Integrity check moved to the bottom.
- **Customers:** "Add customer" from the invoice form (picker option and button) and from the Customers page. Validated: name required and unique, GSTIN checksum (sets the state), state code, credit days 0–365, email format. Customers list is ranked by amount owed with overdue amount, payment pattern and next expected date; the invoice form shows what the chosen customer already owes. Customer page has "New invoice" (prefilled).
- **Search:** header search for customers and invoices (`/` or Ctrl/Cmd+K, arrow keys, Enter); search icon on phones.
- **Navigation:** removed the duplicate "New invoice" menu item; the header button is shown on every screen size.
- **Verified:** 80 tests (new: customer validation and invoicing a new inter-state customer → IGST total ₹11,800). Browser: invalid GSTIN rejected with a message; new customer created, auto-selected, invoice issued (CGST ₹900 + SGST ₹900 = ₹11,800); Customers total ₹10,33,915 equals dashboard "Money to collect"; forecast week totals reconcile (₹2,12,620 + ₹1,66,665 − ₹3,19,000 = ₹60,285); search found the new customer and invoice; 375 px has no horizontal scroll.
