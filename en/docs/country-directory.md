# Country Directory (`/en/country`)

`/en/country` is a dedicated page — its own template
(`templates/pages/country-list.html`), not a reskin of
`category.html` — that lists every published country and lets
editors highlight the ones that matter most, without any code
change or redeploy.

Three concerns are deliberately kept separate:

1. **Country exists** — a row in `countries`, reachable at
   `/en/country/:code`.
2. **Country is featured** — shown prominently at the top of the
   directory page.
3. **Country is a priority market (tier)** — an internal planning
   label for how much editorial/commercial depth that country's own
   hub page deserves.

A country can be any combination of these — featured without being
Tier 1, Tier 1 without being featured, or neither. None of the three
auto-generates content for the others.

## What visitors see

```
/en/country
  ├── "Explore Online Casinos by Country" (heading, fixed copy)
  ├── Featured section         ← only rendered if at least one country is featured
  │     {{featured_section_label}}   (admin-editable, see below)
  │     [ Country card ] [ Country card ] [ Country card ] ...
  └── "Browse All Countries"
        [ search box, filters the list below as you type — client-side, no reload ]
        A
          Argentina  Australia  Austria
        B
          Belgium  Brazil
        ...
```

Draft countries (`status = 'draft'`) and unpublished countries
(`published = 0`) never appear in either section, even if marked
featured — publish state always wins over featured state.

## Admin fields (Countries screen, both dashboards)

Available from the tenant's own dashboard (`/en/dashboard/countries`)
**and** from lummet-control-plane's Countries screen (Content →
Countries) — same fields, same effect, either one writes to the same
`countries` row:

| Field | Column | Effect |
|---|---|---|
| Featured on /en/country directory | `is_featured` | `1` = show in the featured section |
| Featured position | `featured_position` | Lower number shows first. Ties break alphabetically. |
| Tier | `tier` | `1` = deep coverage, `2` = secondary, `3` = directory only. **Planning label only** — see below. |

None of these three fields require the country to also be
`published`/non-draft — but if it isn't, it won't show up in the
directory regardless of what these say. Set publish state first,
then feature/tier it.

## The featured section label

The heading above the featured cards ("Featured Gambling Markets" by
default) is not hardcoded. It's a normal site setting:

- **Key:** `country_directory_featured_label`
- **Where to change it:** tenant dashboard → Settings → General →
  "Country Directory — Featured Section Label"
- Blank = falls back to "Featured Gambling Markets"

Change it to "Popular Markets," "Explore Popular Markets," or
anything else — takes effect on the next page load, no deploy.

## Why `tier` doesn't do anything automatically

This is intentional, not a missing feature. Automatically generating
deep content clusters for every country that gets marked "Tier 1"
would produce the exact anti-pattern this feature was built to avoid:
identical, thin, auto-generated pages at scale. `tier` exists purely
so editorial staff can look at the Countries list and immediately see
"we've committed to real depth here" vs. "this is a directory entry
for now" — the actual hub sub-pages, section-builder content, and SEO
landing pages for a country are still built manually with the tools
that already exist for that (Pages, the section builder on each
country's hub page, `seo_pages`).

If you want tier-based automation later (e.g., a dashboard view
listing "which Tier 1 countries don't have a hub sub-page yet"),
that's a reporting feature to add on top of this data — the columns
are already there to support it.

## Data model

```sql
-- migrations/0026_country_directory_tiers.sql
ALTER TABLE countries ADD COLUMN is_featured INTEGER DEFAULT 0;
ALTER TABLE countries ADD COLUMN featured_position INTEGER DEFAULT 0;
ALTER TABLE countries ADD COLUMN tier INTEGER DEFAULT 3;
CREATE INDEX IF NOT EXISTS idx_countries_featured ON countries(is_featured, featured_position);
```

Defaults preserve prior behavior exactly: every existing country
starts as `is_featured = 0`, `tier = 3` (directory-only) — nothing
appears in the featured section until an admin explicitly puts it
there.

## Query functions (`worker/database/countries.js`)

- **`getFeaturedCountries(db)`** — `is_featured = 1 AND published = 1
  AND status != 'draft'`, ordered by `featured_position ASC, name
  ASC`. No `LIMIT` — the count is whatever the admin has featured,
  never a hardcoded "top 20."
- **`getPublishedCountries(db)`** — every published, non-draft
  country, ordered by name. Feeds the alphabetical directory.
- **`getAllCountries(db)`** — unfiltered, includes drafts. Used by
  admin-facing screens (the Countries list in the dashboard), never
  by public pages.

## Rendering (`worker/controllers.js`)

`renderCountryList()` calls both query functions, groups
`getPublishedCountries()`'s result by the first letter of each
country's **name** (not its ISO code — e.g. Germany/`DE` groups under
"G", not "D"), and renders two HTML fragments
(`featured_countries_html`, `alphabetical_countries_html`) that get
injected into `country-list.html` via triple-brace (`{{{...}}}`)
template variables. Both fragments are built with `escapeHtml()` on
every country name before insertion — a malicious or corrupted
country name cannot break out of the HTML it's placed into.

## Client-side search

Pure progressive enhancement, no new API endpoint: every country
chip in the alphabetical directory carries a
`data-country-name="<lowercase name>"` attribute. A small inline
script in `country-list.html` filters the already-rendered DOM on
`input` — hides non-matching chips and their now-empty letter groups,
shows a "No countries match your search" message if literally nothing
matches. Nothing leaves the browser; this works even if the page is
served from cache.
