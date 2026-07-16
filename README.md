# Kleos — Hiring Contractors in Romania: Taxes, Explained

A standalone, Kleos-branded landing page that explains how contractor taxation
works in Romania (fiscal year 2026), for both the hiring company and the
contractor. Includes an interactive gross-to-net calculator with three legal
setups, a misclassification self-check, and full EN/RO language toggle.

## What's inside

| File | Purpose |
|---|---|
| `index.html` | The entire page — Kleos design tokens, i18n strings, tax engine, UI. Zero build step, zero dependencies. |
| `app.py` | Thin Streamlit wrapper that embeds `index.html` for prototype hosting. |

## Run the prototype (Streamlit)

```bash
pip install streamlit
streamlit run app.py
```

Or open `index.html` directly in any browser — it is fully self-contained
(the only network request is the Archivo font from Google Fonts).

## Features

- **Calculator** — three regimes (PFA real system, PFA income norm, micro-SRL),
  forward mode ("I know the gross") and reverse mode ("I want a target net",
  solved by binary search), animated gross→net waterfall, effective tax rate,
  EUR equivalents.
- **Cases that change the number** — salaried-in-parallel CASS floor removal,
  pensioner CAS exemption, the 24-salary CAS step-up, VAT threshold, FX.
- **Misclassification self-check** — the 7 independence criteria from
  art. 7 pt. 3 of the Fiscal Code, with the 4-of-7 verdict logic.
- **EN / RO toggle** — every string lives in one `I18N` dictionary.

## Updating tax parameters (do this yearly)

All fiscal values live in one object at the top of the `<script>` block in
`index.html`:

```js
const TAX_CONFIG = {
  year: 2026,
  minWage: 4050,          // RON/month — the Jan 1 anchor for all thresholds
  eurRon: 5.07,           // display-only indicative rate
  incomeTaxRate: 0.10,
  cas:  { rate: 0.25, t1: 12, t2: 24 },     // thresholds in min-wage multiples
  cass: { rate: 0.10, floor: 6, cap: 72 },  // cap was 60 → 72 in 2026
  micro: { revTaxLow: 0.01, revTaxHigh: 0.03, highThresholdEur: 60000,
           dividendTax: 0.16, cassBands: [6, 12, 24] }
};
```

Verified against the worked example published by REGNET (120,000 RON gross →
CAS 24,300 / CASS 12,000 / tax 8,370 / net 75,330).

## Disclaimer

Informational only — not tax, legal, or accounting advice. The micro-SRL model
is intentionally simplified (excludes mandatory administrator/employee salary
and accounting fees). Romanian fiscal rules change frequently; confirm against
ANAF guidance or a licensed accountant.
