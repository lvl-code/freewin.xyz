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
- `/dashboard/reports` — create/run/schedule reports across 16 report
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
`campaigns`, the reporting-engine tables, and alert tables). `0033`–`0035`
add the postback/import/reconciliation/provider-adapter schema (see below).
Apply in order alongside your existing migrations — same manual,
per-tenant `wrangler d1 execute` process already used for this repo (no
`migrations_dir`/automated D1 migration tracking is configured).

### Tests

```
cd en && npm test
```
Zero npm dependencies — uses Node 22's built-in `node:test` and
`node:sqlite` against the real schema and migrations. 140 tests covering
item-access scoping/leakage prevention, KPI math, report execution,
Super API handlers, email delivery, and the postback/import/
reconciliation/adapter engine below. Wired into CI on push/PR via
`.github/workflows/test.yml`.

## Conversion Postback / Import / Reconciliation Engine

Universal S2S conversion ingestion, on top of the analytics platform
above — same `analytics_conversions` table, same commercial-terms
commission engine, three ingestion transports feeding one pipeline:

- **Live postback**: `POST/GET /api/v1/conversions/postback/:endpoint_token`
  — self-authenticating per integration (HMAC/shared-secret/API-key/
  signed-query), configurable field mapping, replay protection, IP
  allowlisting. Configure via `/dashboard/postback-configs`.
- **CSV/JSON import**: `POST /api/v1/imports/conversions`, same
  attribution/commission/dedup pipeline, per-row error reporting. See
  `/dashboard/import-history`.
- **Outbound provider adapters**: scheduled pulls from a network's own
  reporting API (`system_settings.provider_sync_cron_enabled`, off by
  default). Only a generic, configurable REST adapter ships — no
  network-specific adapter is invented without that network's real,
  documented API. See `/dashboard/provider-adapters` and
  `en/worker/adapters/base.js` for the interface to implement a real one.

All three record `analytics_conversions.source` (`postback` | `manual` |
`import`) and reuse `analytics_conversions.calculated_commission`
(this platform's own figure, from `affiliate_commercial_terms` — never
trusted from a caller) versus `.reported_commission` (only ever set on
imported/statement rows) for the **Reconciliation** report
(`report_type: "reconciliation"`), which compares the two and never
reports a fabricated match when no statement has been imported at all.

**Cohort analysis** (`report_type: "cohort_analysis"`) —
registration→FTD, FTD→deposit, and revenue-by-acquisition-date, grouped
by casino/GEO/campaign — is also on the same reporting engine.

Full API reference, including every auth method, error response, and
the attribution/dedup rules: **`en/docs/postback-api.md`**.

### Migrations (postback/import/reconciliation/adapters)

`0033` (`postback_configs`, `postback_logs`), `0034` (extends
`analytics_conversions` with `source`/`reported_commission`, adds
`import_batches`), `0035` (`provider_adapter_configs`). Same manual
`wrangler d1 execute` process as above.
