# Webflow Architecture — Scaling the Country Guide to N Countries

This document explains how to reproduce the Romania page for any number of
countries inside Webflow without hitting platform limits, while keeping each
guide more useful than anything Deel, Remote, Papaya, Multiplier or Rippling
publish.

## The core decision: one template page, countries as CMS items

Webflow's constraints (verify current values in Webflow's docs — they vary by
plan and change over time: roughly 100 static pages per site, 20–40 CMS
collections, 30–60 fields per collection, 20 collection lists per page, 10,000
characters of per-page custom code, 50,000 characters per Embed element) all
point to the same architecture. Do not build a static page per country.
Instead, build **one** "Country Guide" CMS template page whose layout is
designed once in the Kleos system, and make every country a CMS item. Adding
Poland or Portugal then means adding a row of content, not designing a page —
and the design stays consistent by construction, because there is only one
design.

The second decision follows from the custom-code limits: the interactive parts
(the calculator and the classification quiz) live in **one external script**,
`kleos-tax-engine.js`, hosted from your GitHub repo via jsDelivr. The Embed
element on the template page is ~600 characters and identical for every
country; it passes the country's tax rules to the engine as JSON bound from a
CMS field. No per-country code, no per-page code budget consumed, one cached
file for the whole site.

## CMS schema

Create a **Country Guides** collection with roughly these fields (well under
the field cap): Name; Slug; Flag/hero image; Year (number); Currency (text);
four "key fact" number+label pairs for the hero strip; Hero heading and lead
(text); Tax system intro (rich text); Filing timeline (rich text, or a
multi-reference — see below); Tax Config JSON (**Plain Text, multi-line** —
this single field drives the entire calculator); SEO title/description; and a
"Reviewed on" date to display freshness, which competitors don't show.

Two small supporting collections keep content reusable across countries:
**Special Cases** (emoji, title, description, impact direction, multi-reference
from Country Guides) and **FAQs** (question, answer, multi-reference). Webflow
allows a nested collection list inside the template page for exactly this
pattern; note nested lists render a limited number of items, so bind these as
top-level collection lists filtered by the current country rather than truly
nested ones.

The `countries/ro.config.json` file in this repo is the master example of the
Tax Config JSON. A new country = write its config (rates, thresholds, regime
steps, labels in English + local language), paste it into the CMS field, fill
the editorial fields, publish. The engine supports six declarative operations
(flat rate, stepped base, clamped base with floor/cap, progressive brackets,
fixed amounts, rate-on-remainder) which cover the contractor regimes of most
European countries — Poland's lump-sum/linear/scale, Portugal's simplified
regime, Bulgaria's flat tax all express in the same schema. If a country needs
an operation the engine lacks, extend the engine once and every country gains
it.

## Page structure on the template

Build the static sections natively in Webflow (hero, key-facts strip, the
three-tax explainer cards, timeline, cases grid, FAQ, footer CTA) as Webflow
Components with CMS bindings — native content is what Google indexes, so the
SEO-carrying copy must never be rendered by JavaScript. Reserve the Embed
element strictly for the two interactive mounts (`#kleos-calc`,
`#kleos-classify`). Use `index.html` in this repo as the pixel reference for
rebuilding the sections: all tokens are declared at the top of its CSS
(orange #F66200, ink #141414, green #009423, deep green #024616, grey #F5F5F5,
radius 24px cards, Archivo type).

For the EN/local-language toggle you have two options. The clean one is
Webflow Localization (paid add-on): it localizes all native CMS content, and
the engine already listens for a `[data-kleos-lang]` button click or a
`kleos:lang` custom event to switch its own strings, which live bilingually in
the config JSON. The budget option is English-only native content with the
bilingual calculator, which still serves the contractor audience where it
matters most — the numbers.

## Why this guide will be unique (and stays unique)

From the competitor review earlier in this project: Deel, Remote, Papaya,
Multiplier and Rippling all publish country pages that describe rates in prose
or static tables, and none of them shows a contractor the actual gross-to-net
math. The differentiators this architecture bakes in:

1. **The gross→net waterfall calculator** with country-specific regimes and a
   reverse mode ("what gross do we need to agree on for X net") — no
   competitor country page has either, and the reverse mode speaks directly to
   the rate-negotiation moment between company and contractor.
2. **The interactive classification test** using the country's real statutory
   criteria (Romania's 4-of-7 from art. 7 pt. 3) instead of a generic
   misclassification paragraph — Rippling gates theirs behind a lead form.
3. **Dual-audience framing**: every section answers both "what does the
   company risk" and "what does the contractor keep", where competitors pick
   one persona per page.
4. **Declared assumptions and a visible "reviewed on" date** next to every
   number — trust signals the aggregator pages lack, and cheap to maintain
   because all figures live in one JSON per country.
5. **Local-language toggle** on a page targeting foreign companies — useful in
   reality (the contractor is the one paying) and a strong E-E-A-T/UX signal.

## Annual maintenance

Each January: update the anchor values in each country's config JSON (for
Romania: `anchors.SM`, thresholds if legislated, `eurRate`, `year`), bump the
"Reviewed on" CMS date, republish. Tag a release in GitHub and pin the jsDelivr
URL to it (`@v1.x.x`) so engine updates roll out deliberately, not on every
commit.

## Files in this repo

- `kleos-tax-engine.js` — the one script for all countries (CDN-hosted).
- `countries/ro.config.json` — Romania in the generic schema; the template for
  every new country.
- `webflow-embed.html` — the exact snippet for the Webflow Embed element.
- `index.html` — the original standalone page; keep it as the design master
  and the Streamlit prototype.
- `app.py` — Streamlit wrapper for prototyping before Webflow builds.
