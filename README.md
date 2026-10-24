# Harbor

**Harbor helps small businesses turn unpaid invoices into a transparent collection plan connected to their upcoming cash obligations.**

Built for HackCache '26, Problem Statement 4: *The Small Business Invoice Chase* (Finance & Banking track, Render bonus track).

> All data in the app is **synthetic**. Sharma Packaging, its customers, GSTINs, phone numbers, bank and UPI details are fictional. Nothing in the demo is a real account, payment or message.

---

## The problem and the user

The owner of a small credit-selling business (the sample is Sharma Packaging, a carton supplier with 8 staff and 12 business customers on 30-day terms) has no accounts-receivable team. Invoices sit at different stages of delay, follow-ups are irregular, and expected receipts are not connected to the salary, rent, supplier and GST payments coming up. The owner often learns about a cash shortage only when an expense is due.

Harbor answers one question every morning: **what should I do today so that I don't run short of cash?**

## What makes it different: the Cash Gap-to-Action Engine

Many accounting products already offer invoices, reminders and ageing reports. Harbor's focus is the connection between four decisions that are usually separate:

1. **When is cash projected to fall below my safety buffer?** (13-week forecast, Cash Gap Radar)
2. **Which unpaid invoice can realistically help before then?** (explainable priority score)
3. **What should I do now?** (escalation ladder, prepared message, owner-controlled handoff)
4. **How does the plan change after the customer responds?** (inbox, reconciliation, recalculated forecast, Decision Trail)

We do not claim no other product does any of these; the claim is that Harbor puts them into one transparent, testable workflow.

### Signature features

- **Cash Gap Radar.** The first projected buffer breach, the payments that cause it, the receipts that arrive too late, and a collection plan that could close the gap.
- **Counterfactual scenarios.** "Collect earlier", "partial collection", "customer pays 30 days later", "payment promise", "postpone a supplier", "new large order". The before/after forecast is recalculated instantly, and **scenario amounts never touch the ledger** (purple, labelled *Scenario (hypothetical)*).
- **Decision Trail.** Every action (reminder prepared, reminder marked sent, promise, dispute, payment claim, bank match confirmed, adjustment, demo-date change) is stored with date, actor, amount and reason, and shown on the invoice timeline and in the evidence pack.
- **Explainable decisions.** No AI scores. Every priority shows its five factor scores, the data used, and a plain-language reason built from current records.

## How it works

### Money
All amounts are integer **paise**. User input is converted from rupees exactly once (`rupeesToPaise`). Rounding uses integer half-away-from-zero division (`roundDiv`). Display uses `Intl.NumberFormat('en-IN')` (₹1,00,000).

### Dates
Dates are `YYYY-MM-DD` strings in IST. Arithmetic uses UTC day numbers so no browser timezone can shift a date. Days overdue are whole calendar days; a due date equal to the Demo Date is 0 days overdue. The Indian financial year runs 1 April to 31 March.

### GST (`src/services/gst.js`)
Per line: taxable = qty × rate × (1 − discount), rounded to the paisa once. Intra-state supplies get CGST and SGST at half the rate each, **each rounded independently**; inter-state supplies get IGST. Lines are summed, then the grand total is rounded to the nearest rupee with an explicit round-off. Intra- vs inter-state compares the supplier's state code with the place of supply. Missing or invalid state data returns an error; nothing is guessed.

| Test | Expected | Actual (automated test) |
|---|---|---|
| ₹10,000 at 18%, MH→MH | CGST ₹900 + SGST ₹900 = ₹11,800 | ₹900 + ₹900 = ₹11,800 ✅ |
| ₹10,000 at 18%, MH→GJ | IGST ₹1,800 = ₹11,800 | ₹1,800 = ₹11,800 ✅ |
| 3 × ₹333 at 5%, intra-state | taxable ₹999, CGST/SGST ₹24.98 each, round-off +₹0.04, total ₹1,049 | same ✅ |
| 10 × ₹1,000 with 10% discount | taxable ₹9,000 | ₹9,000 ✅ |
| Composition business | Bill of Supply, no GST | ✅ |

Document type follows the business registration: **Tax Invoice** (regular), **Bill of Supply** (composition), **Invoice** (unregistered). Allowed rates are configurable (`src/data/config.js`: 0, 3, 5, 18, 40). The sample uses 5% for corrugated cartons and 18% for printing services as *illustrative* rates. **Confirm the applicable rate and HSN classification on the CBIC rate schedule before real use; we have not verified them.**

**E-invoicing:** the invoice screen shows an e-invoicing note when the configured aggregate turnover exceeds ₹5 crore (our understanding of CBIC Notification 10/2023–Central Tax; re-verify on the official portal). Harbor never generates an IRN and labels every invoice as printable only.

**GSTIN validation (`src/utils/gstin.js`)** checks the format (state code, PAN pattern, entity, `Z`, check character) and the base-36 checksum. It reproduces widely published example GSTINs. A valid result means *well-formed*, not *registered*.

### Invoice numbering
`INV/26-27/0001` style, at most 16 characters, consecutive within the financial year, restarting in a new one. Drafts get a number only when issued. Issued invoices cannot be deleted; corrections are credit notes or adjustments.

### Cash forecast (`src/services/forecasting.js`)
- **Cash on hand** = bank snapshot + confirmed receipts dated on/after the snapshot + confirmed unallocated credit − scheduled payments between the snapshot and yesterday.
- **Expected collection date** = due date + the customer's average historical delay (needs ≥ 3 settled invoices; otherwise a default 10 days, low confidence). Estimates already in the past are assumed 7 days from the Demo Date (low confidence). Active promises use the promised date. **Disputed invoices are held out** and listed separately.
- Only the **remaining confirmed balance** is projected, so partial payments are never counted twice and paid invoices never appear.
- **Assumed future sales** (not yet invoiced) are a separate, labelled line (₹1,45,000/week from day 42 in the sample; set to 0 in Settings to forecast only known invoices).
- 13 weeks from the Demo Date. Within a day, payments are applied before receipts. Each week reports opening, collections, assumed sales, payroll, rent, suppliers, operating, tax, other, closing, the lowest running balance and the difference from the buffer. **Invariant (tested): opening + receipts − payments = closing, and each closing = next opening.**
- A **buffer breach** is the first week whose lowest running balance falls below the buffer; **below zero** is reported separately.

### Priority score (`src/services/priorityEngine.js`, weights in `config.js`)
A deterministic 100-point aid for ordering work. **It is not a probability of payment.**

| Factor | Points | Rule |
|---|---|---|
| Cash gap | 35 | share of the first gap this balance could cover × timing. Timing = 1 if due on/before the breach and expected after it (a follow-up can bring it forward), 0.5 if already expected before (protect it), 0 if not due until after the gap. With no gap, scored against bills due in 30 days. |
| Overdue | 20 | linear to 60 days |
| Customer history | 20 | 12 × (avg delay / 30) + 8 × late share; fixed 10 points with too little history |
| Amount | 15 | linear to ₹1,00,000; halved when the invoice already earns gap points (no double reward) |
| Reminder stage | 10 | 10 if a stage is due today, 5 if within 3 days |

Disputed, promised, claimed-paid and stopped invoices are **not** in the chase list; they appear under "Needs review". The **collection plan** greedily takes gap-helping invoices by score until the gap is covered and states what remains. It is a heuristic scenario, not an optimal or guaranteed plan. The suggested "collect by" date is the day before cash first dips below the buffer.

### Escalation ladder (`src/services/reminders.js`)
Default stages from the brief (editable): −3 days heads-up, due date, +7 firm, +15 final (suggest a call), +30 Payment Demand Letter, +45 owner review. Only the latest reached stage can be due; **each stage is sent at most once** unless reset with a reason. The ladder pauses for a **dispute**, an **active promise** (it resumes when the date passes unpaid), a **customer payment claim** under review, a snooze, or when the owner stops follow-ups. A partial payment lowers the amount in the next message automatically.

Opening WhatsApp, email or SMS only **prepares** a message (logged as *prepared*). The owner must press **I sent it** after actually sending. Harbor sends nothing automatically.

### Customer page and Inbox
`/pay/:token` shows the invoice, payments recorded, the remaining balance, payment instructions, and three actions: *I've already paid*, *Something's wrong*, *Send a message*. A payment claim creates an Inbox item and **never** marks the invoice paid; the owner must confirm it against evidence (or reject it with a reason). A dispute pauses reminders immediately. **Limitation:** with localStorage there is no shared backend, so this page works only in the same browser. It simulates the customer side.

### Bank reconciliation (`src/services/reconciliation.js`)
CSV columns `date, description, reference, amount`. For each credit: extract invoice references (tolerant of `INV-26-27-0007`, `inv 26 27 0007`, …), match customer names only when every significant word matches, compare in paise, then suggest **exact / partial / multi-invoice / possible TDS / overpayment / unmatched** with a confidence level and a plain reason. Nothing changes until the owner presses **Confirm and apply**.

| Sample row | Suggestion |
|---|---|
| Kothrud Pharma, INV/26-27/0068, ₹34,913 | Exact (high) |
| Wakad Bakery, INV 26-27 0069, ₹30,000 | Partial (high); ₹24,005 remains |
| Deccan Snacks, two references, ₹56,385 | Multi-invoice, allocated in listed order |
| Chakan, INV/26-27/0070, ₹41,200 | **Possible TDS**: ₹800 short = 2% of taxable ₹40,000; the invoice stays part-paid until the owner records TDS after receiving the certificate |
| Surat Textile, INV/26-27/0067, ₹23,000 | Overpayment; ₹687 kept as unallocated customer credit |
| "R K ENTERPRISES", ₹12,000 | Unknown deposit; held for review |

**Idempotency:** each row gets a deterministic fingerprint (date, amount, reference, description, occurrence index). Re-importing the same file adds nothing. Identical rows inside one file are both kept and flagged for review.

### Display currency
Settings (or the sidebar / "More" sheet) switches the **display** between ₹, $, € and ¥. Conversion uses an owner-entered rate (rupees per 1 unit; the defaults are example values, not live rates) and is applied only when numbers are shown. The ledger, GST, reminders, Payment Demand Letters and printed invoices always stay in INR, and hovering any converted amount shows the exact rupee value. Amount inputs are always in rupees.

### Documents
Print-ready A4 (browser **Save as PDF**):
- **Tax Invoice / Bill of Supply** with a UPI payment-intent QR. The QR pre-fills a payment; it proves nothing.
- **Payment Demand Letter** with the required disclaimer ("…not a notice from the GST department and not a legal notice from a lawyer"), no seals or emblems, a 7-day deadline, and **no interest claim**. MSME statutory interest is disabled because we have not verified the rate and eligibility.
- **Evidence pack** labelling owner-confirmed, customer-submitted and system-generated items.

Optional bilingual (English + Hindi) headings.

## What changes real data vs. what is a scenario

| Changes the ledger | Never changes the ledger |
|---|---|
| Issue invoice, record/confirm payment, confirm bank match, record TDS/credit note, mark reminder sent, record promise, raise/resolve dispute, snooze/stop | Any scenario on Radar/Forecast, opening WhatsApp/email/SMS, importing a statement (until confirmed), a customer payment claim (until confirmed), the integrity check |

## Render Workflow: Cash-Flow Integrity Check

**Why it is useful:** an owner (or judge) can ask an independent service to prove the numbers on screen hold together. The workflow re-validates records, recomputes the 13-week forecast **with the same engine** (`src/services/*`, no second formula), checks invariants, and compares against what the browser showed.

**Task chain** (`workflows/main.js`, `@renderinc/sdk` 1.4):
1. `validate-records`: complete records, integer paise, no negative amounts, unique invoices, payments linked to issued invoices, stored totals equal a fresh GST calculation, no overpaid invoice, no duplicate bank imports.
2. `recompute-forecast`: runs `buildForecast` on the payload.
3. `check-invariants`: carry-forward, weekly reconciliation, no paid or disputed invoices scheduled, no scenario leakage, first breach is the earliest, recomputation matches the screen.
4. `cash-flow-integrity-check`: orchestrates 1→2→3 via `ctx.run` and returns a structured report.

**How it is triggered:**
1. Cash forecast → **Run Cash-Flow Integrity Check** → `POST /api/integrity-check`.
2. The server validates and **minimises** the payload: amounts, dates, rates and anonymous customer codes only. No names, contacts, GSTINs, bank details or messages are sent.
3. The server calls `startTask("<slug>/cash-flow-integrity-check", [payload], { idempotencyKey })`.
4. The page polls `GET /api/integrity-check/:runId` and shows the real status and per-check results.

If the server has no credentials it returns 503 and the UI says **no check was run**; there is no mock result. The audit is read-only.

**Set up on Render**
1. Push this repo to GitHub.
2. **Web service:** Dashboard → New → Blueprint → select the repo (uses `render.yaml`). After the first deploy, set `RENDER_API_KEY` and `WORKFLOW_SLUG` in the service's environment.
3. **Workflow service** (Blueprints don't support Workflows yet): Dashboard → New → Workflow → same repo. Root directory: *(repo root)*, because the tasks import `src/services`. Language: Node. Build: `npm ci`. Start: `node workflows/main.js`. Deploy, and note the workflow slug.
4. Set `WORKFLOW_SLUG` on the web service to that slug and redeploy.
5. **Verify a run:** open the live app → Cash forecast → Run Cash-Flow Integrity Check. The run ID appears in the UI and in the Workflow's *Runs* tab in the Dashboard.

Health/readiness: `GET /api/health` → `{ ok, service, workflowConfigured }`. Starts are rate-limited to 5 per minute per client IP (in-memory; move it to Render Key Value if you run several instances), because each check starts paid Workflow runs.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` runs the tests, builds with `BASE_PATH=/<repo>/` and `VITE_STATIC=1`, copies `index.html` to `404.html` (so deep links work), and publishes `dist/` on every push to `main`. One-time setup: repository **Settings → Pages → Source: GitHub Actions**. The static site has no server, so the Cash-Flow Integrity Check shows a note there instead of a button; everything else runs in the browser.

## Run locally

```bash
npm install
npm test          # 80 automated tests (vitest)
npm run build     # production build into dist/
npm start         # serves dist/ + API on http://localhost:3000
npm run dev       # Vite dev server on :5173 (proxies /api to :3000 if npm start is running)
```

Requires Node 20+. Copy `.env.example` to `.env` (or export the variables) only if you want to call a real Render Workflow from your machine.

**Reset Demo:** Settings → *Reset demo* restores the exact original dataset (deterministic seed, `src/data/seed.js`). **Demo Date:** Settings → +1 / +7 days, or pick a date, to watch reminder stages, ageing and the forecast change.

## Project structure

```
src/
  data/        config.js (all business rules), seed.js (synthetic dataset), templates.js, bank-statement.csv
  utils/       money.js, dates.js, gstin.js
  services/    gst, invoices, customerMetrics, forecasting, priorityEngine, reminders,
               reconciliation, actions (all state transitions), storage, audit (integrity check)
  i18n/        en.js, hi.js
  components/  Layout, ui, Priority, Scenario (what-if + chart), Trail
  pages/       Dashboard, Radar, Forecast, FollowUps, Invoices, InvoiceDetail, NewInvoice,
               Customers, Inbox, Payments, Documents, Print, Escalation, Settings, CustomerPay
server/index.js     Express: static SPA + /api/health + /api/integrity-check
workflows/main.js   Render Workflow tasks
tests/              gst, engine, reconciliation, audit (incl. API), i18n
docs/               test report, Harbor requirement audit (HARBOR_AUDIT.md), demo script, pitch outline
```

Stack: React 19, Vite, Tailwind CSS 4, React Router, plain JavaScript, localStorage, `qrcode`, `lucide-react` (icons), Express 5 (server only), `@renderinc/sdk`. One deliberate deviation from "no backend": the small Express server exists only to keep the Render API key server-side for the required Workflow integration. The product itself remains local-first.

## Known limitations (honest list)

- **Not deployed yet, and no real Workflow run yet.** Code, Blueprint and setup steps are complete; the Render deployment and a real run need account access (see `docs/TEST_REPORT.md`, "Deployment status").
- **localStorage only:** data lives in one browser, unencrypted, without backup or multi-user access. Not suitable for real financial records.
- **Customer page is same-browser only** (no shared backend).
- **No automatic messaging.** WhatsApp/email/SMS are owner-controlled handoffs.
- **Tax rules not independently verified:** sample GST rates/HSN codes are illustrative; the e-invoicing threshold and MSME wording should be re-checked on official portals. No statutory interest is calculated.
- **Hindi text** was written for this prototype and has **not** been professionally reviewed. Stored data (expense labels, invoice line descriptions) stays in the language it was entered in.
- **No user research has been done.** The validation hypothesis and planned test are in `docs/PITCH.md`; no results are claimed.
- The bundle is ~570 kB (about 165 kB gzip), with no code-splitting yet.
- Exchange rates for the display currency are typed in by the owner; there is no live rate feed.

## Next steps toward real use

1. Shared backend with authentication and encrypted storage, so the customer page works across devices.
2. Bank statement formats from real Indian banks; Account Aggregator integration with explicit consent.
3. Verified GST/e-invoice/MSME rules with a tax professional; e-invoice (IRP) integration if turnover requires it.
4. WhatsApp Business Platform with approved templates and opt-in (optional, owner-enabled).
5. A pilot with three or more small-business owners measuring time-to-decision and correctness against a manual invoice list.
