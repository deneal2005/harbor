# Pitch deck outline (7 slides)

Use real screenshots from the deployed app. Do not add market sizes, revenue, partners or impact numbers we have not measured.

1. **Harbor:** turn unpaid invoices into a cash plan. Screenshot: Dashboard breach alert.
2. **The problem:** a profitable credit-selling SME still runs short because receipts and obligations are not connected and follow-ups are irregular. Target user: an owner with no AR team. Evidence: the official HackCache PS4 brief. No invented interviews.
3. **Cash Gap-to-Action Engine:** gap → best next collection → customer response → updated forecast. Differentiation is the connected, explainable workflow, not any single feature.
4. **Product:** Radar plan + "Why this invoice?", counterfactual, follow-up handoff, customer dispute, bank reconciliation, demand letter.
5. **How it works:** integer paise; GST per line with independent CGST/SGST rounding; 13-week forecast invariants; 5-factor deterministic score; reconciliation requiring owner confirmation; Render Workflow integrity check (3 chained tasks, same engine, read-only, anonymised payload).
6. **Evidence and limits:** 72 automated tests (show the GST table and six reconciliation cases); browser-verified signature flow. Unproven: real-world demand, collection impact, cross-device use, tax-rule verification, Hindi review.
7. **Path to adoption:** pilot with 3+ owners; shared encrypted backend; Account Aggregator bank feeds with consent; verified tax rules; optional WhatsApp Business templates.

## Validation plan (not yet run, so no results are claimed)

**Hypothesis:** for an owner with several unpaid invoices and scheduled obligations, Harbor reduces the time to identify and act on priority collections and produces a more transparent short-term cash plan than a manual invoice list.

**Test:** at least three owners (or people doing comparable AR work) on the seeded scenario, once with a spreadsheet and once with Harbor.
Measures: time to name the three most useful invoices; correct first shortfall date; correct balances; steps to prepare a follow-up; correct treatment of the disputed invoice; ability to explain the priority and the forecast assumptions.

**Targets, set before testing:** ≥ 50% faster to the three invoices; 100% correct shortfall date; 0 balance errors. Record actual results separately; never present targets as results.
