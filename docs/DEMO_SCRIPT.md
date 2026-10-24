# Demo script

Start from a clean state: Settings → **Reset demo** (Demo Date 23 Oct 2026). All data is fictional.

## Five-minute video

| Time | Screen | What to show and say |
|---|---|---|
| 0:00–0:25 | Dashboard | "Deneal runs Sharma Packaging: 8 staff, 12 customers on 30-day credit. ₹10.2 lakh is owed to the business, yet on 1 November, salary day, its cash falls ₹89,715 below the ₹1.5 lakh buffer it needs." |
| 0:25–1:00 | Dashboard → Radar | Point at the red alert and the "Lowest point" and "First week below buffer" tiles. Open the Radar: salaries ₹2.64 L and rent create the gap; receipts listed under "Expected too late to help". |
| 1:00–1:45 | Radar | The collection plan: Nashik 0060 + part of Hadapsar 0064 close the gap. Expand "Why this invoice?" on Nashik (factor table, 30-day average delay). Compare Chakan 0072 (₹2.3 L, larger) → "not due until 14 Nov, after the gap", 0 gap points. Press **Try "collect earlier"** → gap ₹89,715 → ₹16,825, purple scenario line. "Nothing has been recorded." |
| 1:45–2:30 | Follow-ups → customer page → Inbox | Nashik's final reminder, prepared in Hindi (customer preference). Show WhatsApp handoff and **I sent it** ("opening WhatsApp does not send"). Open Surat 0065's customer page → *Something's wrong* → submit. Inbox shows the dispute; follow-ups paused. |
| 2:30–3:10 | Payments | **Load sample statement** → six suggestions with reasons (exact, partial, multi, possible TDS 2%, overpayment, unknown). Load it again → "6 already imported". Confirm Kothrud → back to Dashboard: bank +₹34,913, gap ₹54,802. |
| 3:10–3:40 | Invoice / Documents | Print a Tax Invoice (CGST/SGST split, round-off, words, UPI QR) and a Payment Demand Letter for Pimpri (disclaimer, no interest claim). |
| 3:40–4:15 | Forecast | **Run Cash-Flow Integrity Check** on Render Workflows: 3 chained tasks re-validate records, recompute the forecast with the same engine, check invariants; show the run ID and all checks passing. Mention integer paise and 72 automated tests. |
| 4:15–4:40 | Settings | Demo Date +7 → stages advance; Hindi + large text. Limitations: same-browser customer page, synthetic data, no user testing yet, tax rates to be verified. |
| 4:40–5:00 | Dashboard | "Harbor connects the cash gap to the next defensible collection action, and every number can be explained." |

## Three-minute cut
0:00–0:20 problem on the Dashboard → 0:20–1:10 Radar (plan, why, collect earlier) → 1:10–1:50 follow-up + customer dispute → 1:50–2:30 bank import + confirm → 2:30–2:50 integrity check run → 2:50–3:00 close.

Rehearse on the deployed URL; record only real interactions.
