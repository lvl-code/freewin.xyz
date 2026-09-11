# level.casino

Cloudflare Worker-based casino platform.

## Architecture

Application code lives under `en/`.

## Deployment

Deployment is handled through GitHub Actions and Cloudflare Wrangler.

## Structure

- `en/worker/` — Worker application
- `en/templates/` — rendering/templates
- `en/static/` — frontend assets
- `en/migrations/` — D1 migrations
- `en/lummet/` — Lummet AI
- `en/schema.sql` — database schema
- `wrangler.jsonc` — Cloudflare configuration

## Analytics / Reporting / Alerting Platform

Event logging, KPI reporting, scheduled reports, and threshold-based
alerting, built on top of the existing item-access/RBAC model — every
query is scoped to what the requesting user can actually see, the same
way the rest of the admin dashboard already works.

### What's tracked

Casino/review/news/page views, offer views, banner views, and
tracking-link clicks/redirects are logged automatically (non-blocking,
via `ctx.waitUntil`) to `analytics_events`. Conversions are recorded via
`POST /api/v1/analytics/conversion/record`, looking up the applicable
`affiliate_commercial_terms` row to calculate commission.

### Dashboard

- `/dashboard/analytics` — KPI cards, performance-by-dimension tables,
  GEO breakdown, open alerts + alert-rule management
- `/dashboard/campaigns` — campaign CRUD
- `/dashboard/reports` — create/run/schedule reports across 14 report
  types (CSV/HTML/JSON export, column selection, grouping with
  subtotals); `seo_performance` is a recognized type with no data
  source configured — it returns a clear error rather than fabricated
  numbers

### Scheduled jobs (all off by default — enable per tenant via `system_settings`)

```sql
INSERT OR REPLACE INTO system_settings (key, value) VALUES ('analytics_aggregation_cron_enabled', 'true');
INSERT OR REPLACE INTO system_settings (key, value) VALUES ('report_schedules_cron_enabled', 'true');
INSERT OR REPLACE INTO system_settings (key, value) VALUES ('alert_rules_cron_enabled', 'true');
```

### Email delivery (scheduled reports)

Provider: [Resend](https://resend.com). Two required secrets, set per
tenant, never committed:
```
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_EMAIL
```
Without these, email-recipient scheduled reports fail loudly (recorded
in the audit log, `action: 'delivery_failed'`) rather than silently —
in-app notification delivery works regardless.

### Super API (v9)

Tenant-wide, HMAC-signed control-plane access. Capabilities relevant to
this platform: `analytics` (tenant-wide aggregates — overview, revenue,
tracking health), `reports` (list/get/create/run), `campaigns` (full
CRUD), `alerts` (list/create rules, list/acknowledge). See
`en/worker/super/handlers-analytics.js` and `handlers-reporting.js` for
exactly what's exposed and why.

### Migrations

`0027`–`0032` add the analytics/reporting/alerting schema
(`analytics_events`, `analytics_daily`, `analytics_conversions`,
`campaigns`, the reporting-engine tables, and alert tables). Apply in
order alongside your existing migrations — same manual, per-tenant
`wrangler d1 execute` process already used for this repo (no
`migrations_dir`/automated D1 migration tracking is configured).

### Tests

```
cd en && npm test
```
Zero npm dependencies — uses Node 22's built-in `node:test` and
`node:sqlite` against the real schema and migrations. 70 tests covering
item-access scoping/leakage prevention, KPI math, report execution,
Super API handlers, and email delivery. Wired into CI on push/PR via
`.github/workflows/test.yml`.
